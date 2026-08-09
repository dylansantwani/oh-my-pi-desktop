import { describe, expect, it } from 'vitest'
import { extractFileRefs, mergeFileRefs, type FileRef } from '../src/renderer/src/lib/files'

const DIR = 'C:\\proj'

function tool(name: string, args: Record<string, unknown>): Record<string, unknown> {
  return { type: 'tool_execution_start', toolCallId: 't1', name, args }
}

describe('extractFileRefs', () => {
  it('returns [] for non-tool events', () => {
    expect(extractFileRefs({ type: 'message_update' }, DIR)).toEqual([])
  })
  it('extracts a read tool path, not modified', () => {
    const refs = extractFileRefs(tool('read', { path: 'a.txt' }), DIR)
    expect(refs).toHaveLength(1)
    expect(refs[0].path).toBe('C:\\proj\\a.txt')
    expect(refs[0].name).toBe('a.txt')
    expect(refs[0].modified).toBe(false)
  })
  it('marks write/edit/append tools as modified', () => {
    for (const name of ['write', 'edit', 'append', 'apply_patch']) {
      const [ref] = extractFileRefs(tool(name, { path: 'x.ts' }), DIR)
      expect(ref.modified).toBe(true)
    }
  })
  it('treats absolute paths as absolute', () => {
    const [ref] = extractFileRefs(tool('read', { path: 'C:\\other\\f.txt' }), DIR)
    expect(ref.path).toBe('C:\\other\\f.txt')
  })
  it('ignores glob patterns (values containing * or ?)', () => {
    expect(extractFileRefs(tool('glob', { pattern: 'src/**/*.ts', path: 'src' }), DIR)).toEqual([])
    expect(extractFileRefs(tool('read', { path: '*.md' }), DIR)).toEqual([])
  })
  it('extracts from unknown tools via explicit file keys', () => {
    const [ref] = extractFileRefs(tool('custom_tool', { filePath: 'z.log' }), DIR)
    expect(ref.path).toBe('C:\\proj\\z.log')
  })
  it('reads the real omp toolName field and marks write modified', () => {
    const [ref] = extractFileRefs({ type: 'tool_execution_start', toolCallId: 'c1', toolName: 'write', args: { content: 'x', path: 'hello.txt' } }, DIR)
    expect(ref.path).toBe('C:\\proj\\hello.txt')
    expect(ref.modified).toBe(true)
  })
  it('ignores non-string and empty path values', () => {
    expect(extractFileRefs(tool('read', { path: 42 }), DIR)).toEqual([])
    expect(extractFileRefs(tool('read', { path: '' }), DIR)).toEqual([])
  })
})

// The same extraction has to hold on macOS/Linux, where omp emits POSIX paths.
// Hardcoded backslashes used to mangle these into `\Users\...` and show the
// whole absolute path as the file's display name.
describe('extractFileRefs on POSIX projects', () => {
  const POSIX = '/Users/dylan/proj'

  it('joins a relative path with forward slashes', () => {
    const [ref] = extractFileRefs(tool('read', { path: 'src/cli/export.ts' }), POSIX)
    expect(ref.path).toBe('/Users/dylan/proj/src/cli/export.ts')
    expect(ref.name).toBe('export.ts')
  })
  it('keeps an absolute POSIX path and still names just the file', () => {
    const [ref] = extractFileRefs(tool('edit', { path: '/Users/dylan/proj/src/main/index.ts' }), POSIX)
    expect(ref.path).toBe('/Users/dylan/proj/src/main/index.ts')
    expect(ref.name).toBe('index.ts')
    expect(ref.modified).toBe(true)
  })
  it('does not introduce a double separator when the project dir has a trailing slash', () => {
    const [ref] = extractFileRefs(tool('read', { path: 'a.txt' }), '/Users/dylan/proj/')
    expect(ref.path).toBe('/Users/dylan/proj/a.txt')
  })
  it('never emits a backslash on a POSIX project', () => {
    const [ref] = extractFileRefs(tool('write', { path: 'src/renderer/src/App.tsx' }), POSIX)
    expect(ref.path).not.toContain('\\')
    expect(ref.name).toBe('App.tsx')
  })
})

describe('mergeFileRefs', () => {
  it('dedupes by path and preserves modified across merges', () => {
    const a: FileRef[] = [{ path: 'C:\\proj\\a.txt', name: 'a.txt', modified: false, firstSeenAt: 1 }]
    const b: FileRef[] = [
      { path: 'C:\\proj\\a.txt', name: 'a.txt', modified: true, firstSeenAt: 2 },
      { path: 'C:\\proj\\b.txt', name: 'b.txt', modified: false, firstSeenAt: 3 }
    ]
    const out = mergeFileRefs(a, b)
    expect(out).toHaveLength(2)
    expect(out.find((f) => f.path.endsWith('a.txt'))?.modified).toBe(true)
  })
})
