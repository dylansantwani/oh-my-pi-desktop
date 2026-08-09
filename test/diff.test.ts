import { describe, expect, it } from 'vitest'
import { diffLines, diffStat, extractDiff, type DiffHunk, type DiffRow } from '../src/renderer/src/lib/diff'

function shape(rows: DiffRow[]): string[] {
  return rows.map((r) => `${r.kind}:${r.text}`)
}

function allRows(hunks: DiffHunk[]): DiffRow[] {
  return hunks.flatMap((h) => h.rows)
}

// Every ctx/del row replays the old file and every ctx/add row replays the new
// one — the strongest check that an alignment is actually valid.
function replay(hunks: DiffHunk[]): { old: string[]; next: string[] } {
  const rows = allRows(hunks)
  return {
    old: rows.filter((r) => r.kind !== 'add').map((r) => r.text),
    next: rows.filter((r) => r.kind !== 'del').map((r) => r.text)
  }
}

describe('diffLines alignment', () => {
  it('reports no hunks for identical text', () => {
    const d = diffLines('a\nb\nc\n', 'a\nb\nc\n')
    expect(d.hunks).toEqual([])
    expect(d.degraded).toBe(false)
    expect(diffStat(d.hunks)).toEqual({ added: 0, removed: 0 })
  })

  it('pairs a changed line as one del then one add, with the right line numbers', () => {
    const d = diffLines('a\nb\nc\nd\n', 'a\nx\nc\nd\n')
    expect(d.hunks).toHaveLength(1)
    const rows = d.hunks[0].rows
    expect(shape(rows)).toEqual(['ctx:a', 'del:b', 'add:x', 'ctx:c', 'ctx:d'])
    expect(rows[0]).toMatchObject({ oldLine: 1, newLine: 1 })
    expect(rows[1]).toMatchObject({ oldLine: 2, newLine: null })
    expect(rows[2]).toMatchObject({ oldLine: null, newLine: 2 })
    expect(rows[3]).toMatchObject({ oldLine: 3, newLine: 3 })
    expect(diffStat(d.hunks)).toEqual({ added: 1, removed: 1 })
  })

  it('keeps new-side numbering ahead of old-side after an insertion', () => {
    const d = diffLines('a\nb\nc\n', 'a\nnew1\nnew2\nb\nc\n')
    const rows = d.hunks[0].rows
    expect(shape(rows)).toEqual(['ctx:a', 'add:new1', 'add:new2', 'ctx:b', 'ctx:c'])
    expect(rows[1]).toMatchObject({ oldLine: null, newLine: 2 })
    expect(rows[3]).toMatchObject({ oldLine: 2, newLine: 4 })
    expect(rows[4]).toMatchObject({ oldLine: 3, newLine: 5 })
  })

  it('treats an empty old side as a pure insert (the write-tool case)', () => {
    const d = diffLines('', 'one\ntwo\n')
    expect(shape(allRows(d.hunks))).toEqual(['add:one', 'add:two'])
    expect(diffStat(d.hunks)).toEqual({ added: 2, removed: 0 })
  })

  it('finds the minimal edit script on the classic Myers pair', () => {
    // ABCABBA -> CBABAC needs D = 5 (LCS length 4).
    const a = 'A\nB\nC\nA\nB\nB\nA'
    const b = 'C\nB\nA\nB\nA\nC'
    const d = diffLines(a, b, 1000)
    const stat = diffStat(d.hunks)
    expect(stat.added + stat.removed).toBe(5)
    expect(d.degraded).toBe(false)
    const { old, next } = replay(d.hunks)
    expect(old.join('\n')).toBe(a)
    expect(next.join('\n')).toBe(b)
  })

  it('normalises CRLF and ignores the trailing newline', () => {
    const d = diffLines('a\r\nb\r\n', 'a\nb')
    expect(d.hunks).toEqual([])
  })
})

describe('hunk grouping', () => {
  const base = Array.from({ length: 30 }, (_, i) => `l${i + 1}`).join('\n')

  it('collapses long unchanged runs into separate hunks with N lines of context', () => {
    const changed = base.replace('l5\n', 'X\n').replace('l25\n', 'Y\n')
    const d = diffLines(base, changed)
    expect(d.hunks).toHaveLength(2)
    expect(shape(d.hunks[0].rows)).toEqual(['ctx:l2', 'ctx:l3', 'ctx:l4', 'del:l5', 'add:X', 'ctx:l6', 'ctx:l7', 'ctx:l8'])
    expect(d.hunks[0]).toMatchObject({ oldStart: 2, oldCount: 7, newStart: 2, newCount: 7 })
    expect(d.hunks[1].rows[0]).toMatchObject({ text: 'l22', oldLine: 22 })
    // 30-line file, only 16 rows kept
    expect(allRows(d.hunks)).toHaveLength(16)
  })

  it('merges changes whose context blocks touch into one hunk', () => {
    const changed = base.replace('l5\n', 'X\n').replace('l8\n', 'Y\n')
    const d = diffLines(base, changed)
    expect(d.hunks).toHaveLength(1)
    expect(diffStat(d.hunks)).toEqual({ added: 2, removed: 2 })
  })

  it('honours a custom context width', () => {
    const changed = base.replace('l15\n', 'X\n')
    expect(diffLines(base, changed, 0).hunks[0].rows).toHaveLength(2)
    expect(diffLines(base, changed, 1).hunks[0].rows).toHaveLength(4)
  })
})

describe('size guard', () => {
  it('falls back to a whole-block replace past the line limit', () => {
    const big = Array.from({ length: 5001 }, (_, i) => `line ${i}`).join('\n')
    const started = Date.now()
    const d = diffLines(big, `${big}\nextra`)
    expect(Date.now() - started).toBeLessThan(2000)
    expect(d.degraded).toBe(true)
    expect(d.hunks).toHaveLength(1)
    expect(diffStat(d.hunks)).toEqual({ added: 5002, removed: 5001 })
  })

  it('falls back when the edit script is longer than the cap', () => {
    const a = Array.from({ length: 1500 }, (_, i) => `alpha ${i}`).join('\n')
    const b = Array.from({ length: 1500 }, (_, i) => `beta ${i}`).join('\n')
    const started = Date.now()
    const d = diffLines(a, b)
    expect(Date.now() - started).toBeLessThan(5000)
    expect(d.degraded).toBe(true)
    expect(diffStat(d.hunks)).toEqual({ added: 1500, removed: 1500 })
  })

  it('still runs the real diff on a large file with a small edit', () => {
    const lines = Array.from({ length: 4000 }, (_, i) => `line ${i}`)
    const a = lines.join('\n')
    lines[2000] = 'patched'
    const d = diffLines(a, lines.join('\n'))
    expect(d.degraded).toBe(false)
    expect(diffStat(d.hunks)).toEqual({ added: 1, removed: 1 })
    expect(d.hunks[0].rows[0]).toMatchObject({ text: 'line 1997', oldLine: 1998 })
  })
})

describe('extractDiff', () => {
  it('reads the edit shape: file_path + old_string/new_string', () => {
    expect(extractDiff('edit', { file_path: 'C:\\proj\\a.ts', old_string: 'a', new_string: 'b' })).toEqual({
      path: 'C:\\proj\\a.ts',
      oldText: 'a',
      newText: 'b'
    })
  })

  it('accepts the path/old_str/new_str spelling and unknown tool names', () => {
    expect(extractDiff('str_replace', { path: 'a.ts', old_str: 'x', new_str: 'y' })).toEqual({ path: 'a.ts', oldText: 'x', newText: 'y' })
  })

  it('reads the write shape: content against an empty old side', () => {
    expect(extractDiff('write', { file_path: 'a.ts', content: 'hello\n' })).toEqual({ path: 'a.ts', oldText: '', newText: 'hello\n' })
    expect(extractDiff('mcp__fs__write_file', { path: 'a.ts', content: 'hi' })?.newText).toBe('hi')
  })

  it('does not treat content on a non-write tool as a diff', () => {
    expect(extractDiff('bash', { path: 'a.ts', content: 'hello' })).toBeNull()
  })

  it('reads a batch of edits as one before/after block', () => {
    const src = extractDiff('edit', {
      file_path: 'a.ts',
      edits: [
        { old_string: 'one', new_string: 'ONE' },
        { old_string: 'two', new_string: 'TWO' }
      ]
    })
    expect(src).toEqual({ path: 'a.ts', oldText: 'one\ntwo', newText: 'ONE\nTWO' })
    expect(diffStat(diffLines(src!.oldText, src!.newText).hunks)).toEqual({ added: 2, removed: 2 })
  })

  it('skips malformed entries in an edits array', () => {
    expect(extractDiff('edit', { path: 'a.ts', edits: [null, 'nope', { old_string: 'a' }, { old_string: 'a', new_string: 'b' }] })).toEqual({
      path: 'a.ts',
      oldText: 'a',
      newText: 'b'
    })
    expect(extractDiff('edit', { path: 'a.ts', edits: [{ insert_line: 3 }] })).toBeNull()
  })

  it('returns null for shapes it cannot read', () => {
    expect(extractDiff('edit', { file_path: 'a.ts' })).toBeNull()
    expect(extractDiff('apply_patch', { patch: '@@ -1 +1 @@' })).toBeNull()
    expect(extractDiff('read', { path: 'a.ts' })).toBeNull()
    expect(extractDiff('edit', null)).toBeNull()
    expect(extractDiff('edit', 'a string')).toBeNull()
    expect(extractDiff('edit', ['a', 'b'])).toBeNull()
    expect(extractDiff('edit', { old_string: 'a', new_string: 3 })).toBeNull()
  })

  it('tolerates a missing path', () => {
    expect(extractDiff('edit', { old_string: 'a', new_string: 'b' })?.path).toBe('')
  })
})
