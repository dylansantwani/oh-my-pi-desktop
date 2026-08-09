// Dependency-free line diff for the tool-call cards. Myers O(ND) over lines,
// with two guards: oversized inputs and edit scripts longer than MAX_EDIT_SCRIPT
// degrade to a whole-block replace. Both exist because this runs synchronously
// on the renderer thread — a runaway diff on a huge file would freeze the UI.

export type DiffRowKind = 'add' | 'del' | 'ctx'

export interface DiffRow {
  kind: DiffRowKind
  text: string
  oldLine: number | null
  newLine: number | null
}

export interface DiffHunk {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  rows: DiffRow[]
}

export interface LineDiff {
  hunks: DiffHunk[]
  /** true when a guard tripped and the diff is a whole-block replace, not a real alignment */
  degraded: boolean
}

export interface DiffStat {
  added: number
  removed: number
}

export interface DiffSource {
  path: string
  oldText: string
  newText: string
}

export const DEFAULT_CONTEXT = 3

// Guards, sized so any ordinary source file takes the real diff path.
const MAX_LINES = 5000
const MAX_CHARS = 1_000_000
// Also caps trace memory: (cap + 1) rounds x (2 * cap + 3) ints, ~11 MB here.
const MAX_EDIT_SCRIPT = 1200

export function diffLines(oldText: string, newText: string, context: number = DEFAULT_CONTEXT): LineDiff {
  const a = splitLines(oldText)
  const b = splitLines(newText)
  const oversized = a.length > MAX_LINES || b.length > MAX_LINES || oldText.length > MAX_CHARS || newText.length > MAX_CHARS
  const aligned = oversized ? null : align(a, b)
  const rows = aligned ?? replaceRows(a, b)
  return { hunks: groupHunks(rows, Math.max(0, context)), degraded: aligned === null }
}

export function diffStat(hunks: DiffHunk[]): DiffStat {
  let added = 0
  let removed = 0
  for (const h of hunks) {
    for (const r of h.rows) {
      if (r.kind === 'add') added++
      else if (r.kind === 'del') removed++
    }
  }
  return { added, removed }
}

function splitLines(text: string): string[] {
  if (text === '') return []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  // A trailing newline terminates the last line, it does not start a new one.
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

// Returns null when the edit script blows past the cap.
function align(a: string[], b: string[]): DiffRow[] | null {
  let pre = 0
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++
  let suf = 0
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++
  // Trimming the shared head/tail first is what keeps a one-line edit in a
  // 5000-line file at D = 2 instead of walking the whole file.
  const script = myers(a.slice(pre, a.length - suf), b.slice(pre, b.length - suf))
  if (!script) return null
  const rows: DiffRow[] = []
  let oldLine = 1
  let newLine = 1
  for (let i = 0; i < pre; i++) rows.push({ kind: 'ctx', text: a[i], oldLine: oldLine++, newLine: newLine++ })
  for (const op of script) {
    if (op.kind === 'ctx') rows.push({ kind: 'ctx', text: op.text, oldLine: oldLine++, newLine: newLine++ })
    else if (op.kind === 'del') rows.push({ kind: 'del', text: op.text, oldLine: oldLine++, newLine: null })
    else rows.push({ kind: 'add', text: op.text, oldLine: null, newLine: newLine++ })
  }
  for (let i = a.length - suf; i < a.length; i++) rows.push({ kind: 'ctx', text: a[i], oldLine: oldLine++, newLine: newLine++ })
  return rows
}

function replaceRows(a: string[], b: string[]): DiffRow[] {
  const rows: DiffRow[] = []
  a.forEach((text, i) => rows.push({ kind: 'del', text, oldLine: i + 1, newLine: null }))
  b.forEach((text, i) => rows.push({ kind: 'add', text, oldLine: null, newLine: i + 1 }))
  return rows
}

interface DiffOp {
  kind: DiffRowKind
  text: string
}

function myers(a: string[], b: string[]): DiffOp[] | null {
  const n = a.length
  const m = b.length
  if (n === 0 && m === 0) return []
  // The furthest-reaching path only ever visits diagonals |k| <= d, so V needs
  // 2 * bound + 3 slots rather than one per line — that is what keeps the
  // per-round trace snapshots small enough to hold on to.
  const bound = Math.min(n + m, MAX_EDIT_SCRIPT)
  const offset = bound + 1
  const v = new Int32Array(2 * bound + 3)
  const trace: Int32Array[] = []
  for (let d = 0; d <= bound; d++) {
    trace.push(v.slice())
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) {
        x++
        y++
      }
      v[offset + k] = x
      if (x >= n && y >= m) return backtrack(trace, a, b, offset)
    }
  }
  return null
}

function backtrack(trace: Int32Array[], a: string[], b: string[], offset: number): DiffOp[] {
  const ops: DiffOp[] = []
  let x = a.length
  let y = b.length
  for (let d = trace.length - 1; d >= 0; d--) {
    const v = trace[d]
    const k = x - y
    const prevK = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? k + 1 : k - 1
    const prevX = v[offset + prevK]
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) {
      x--
      y--
      ops.push({ kind: 'ctx', text: a[x] })
    }
    if (d > 0) {
      if (x === prevX) ops.push({ kind: 'add', text: b[prevY] })
      else ops.push({ kind: 'del', text: a[prevX] })
    }
    x = prevX
    y = prevY
  }
  ops.reverse()
  return orderChangeRuns(ops)
}

// Myers can hand back a changed block as del/add/del/add; unified diffs read as
// every removal first, then every addition. Re-order within each run only.
function orderChangeRuns(ops: DiffOp[]): DiffOp[] {
  const out: DiffOp[] = []
  let i = 0
  while (i < ops.length) {
    if (ops[i].kind === 'ctx') {
      out.push(ops[i])
      i++
      continue
    }
    let j = i
    while (j < ops.length && ops[j].kind !== 'ctx') j++
    const run = ops.slice(i, j)
    for (const op of run) if (op.kind === 'del') out.push(op)
    for (const op of run) if (op.kind === 'add') out.push(op)
    i = j
  }
  return out
}

function groupHunks(rows: DiffRow[], context: number): DiffHunk[] {
  const ranges: Array<[number, number]> = []
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].kind === 'ctx') continue
    const start = Math.max(0, i - context)
    const end = Math.min(rows.length - 1, i + context)
    const last = ranges[ranges.length - 1]
    // A single unchanged line between two changes is not worth a separator, so
    // merge whenever the context blocks touch.
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end)
    else ranges.push([start, end])
  }
  return ranges.map(([start, end]) => {
    const slice = rows.slice(start, end + 1)
    return {
      oldStart: slice.find((r) => r.oldLine !== null)?.oldLine ?? 0,
      oldCount: slice.filter((r) => r.oldLine !== null).length,
      newStart: slice.find((r) => r.newLine !== null)?.newLine ?? 0,
      newCount: slice.filter((r) => r.newLine !== null).length,
      rows: slice
    }
  })
}

// ---------- tool-arg extraction ----------

const PATH_KEYS = ['file_path', 'filePath', 'path', 'absolute_path', 'target_file', 'notebook_path', 'file', 'filename']
const OLD_KEYS = ['old_string', 'oldString', 'old_str', 'old_text', 'oldText', 'old_content', 'search']
const NEW_KEYS = ['new_string', 'newString', 'new_str', 'new_text', 'newText', 'new_content', 'replace']
const CONTENT_KEYS = ['content', 'contents', 'text', 'body', 'data']
const EDIT_LIST_KEYS = ['edits', 'replacements', 'changes']
// Whole-file writers: their content arg is the new file, so the diff is all adds.
const WRITE_TOOLS = new Set(['write', 'write_file', 'writefile', 'create', 'create_file', 'new_file', 'save', 'save_file', 'overwrite'])

/**
 * Pull a diffable before/after out of a tool call's args. Unrecognised shapes
 * (patch text, renames, anything without a readable before/after) return null
 * so the card keeps its raw-JSON rendering.
 */
export function extractDiff(name: string, args: unknown): DiffSource | null {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return null
  const rec = args as Record<string, unknown>
  const path = pick(rec, PATH_KEYS) ?? ''
  const oldText = pick(rec, OLD_KEYS)
  const newText = pick(rec, NEW_KEYS)
  // An explicit before/after pair is unambiguous, so it is honoured whatever the
  // tool calls itself — omp names this edit, real agents also use str_replace.
  if (oldText !== null && newText !== null) return { path, oldText, newText }
  const batch = collectEdits(rec)
  if (batch) return { path, ...batch }
  const content = pick(rec, CONTENT_KEYS)
  if (content !== null && isWriteTool(name)) return { path, oldText: '', newText: content }
  return null
}

function pick(rec: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const k of keys) {
    const v = rec[k]
    if (typeof v === 'string') return v
  }
  return null
}

function collectEdits(rec: Record<string, unknown>): { oldText: string; newText: string } | null {
  for (const key of EDIT_LIST_KEYS) {
    const list = rec[key]
    if (!Array.isArray(list)) continue
    const olds: string[] = []
    const news: string[] = []
    for (const item of list) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const e = item as Record<string, unknown>
      const oldText = pick(e, OLD_KEYS)
      const newText = pick(e, NEW_KEYS)
      if (oldText === null || newText === null) continue
      olds.push(oldText)
      news.push(newText)
    }
    if (olds.length === 0) continue
    // One card per tool call, so the batch is diffed as a single block: every
    // edit's before/after shows, just without the untouched stretches of file
    // that separate them.
    return { oldText: olds.join('\n'), newText: news.join('\n') }
  }
  return null
}

function isWriteTool(name: string): boolean {
  // MCP tools arrive namespaced (mcp__fs__write_file); only the last segment is the verb.
  const base = name.toLowerCase().split(/__|[.:]/).filter(Boolean).pop() ?? ''
  return WRITE_TOOLS.has(base)
}
