// Pure file tracking from tool_execution_start events. No I/O.
export interface FileRef {
  path: string
  name: string
  modified: boolean
  firstSeenAt: number
}

// Tools that act on a single file and whose path args we trust.
const FILE_TOOLS = new Set(['read', 'write', 'edit', 'append', 'apply_patch', 'rename', 'move', 'delete', 'remove'])
// Tools that change file state — surfaced as "modified" in the Files tab.
const WRITE_TOOLS = new Set(['write', 'edit', 'append', 'apply_patch', 'rename', 'move', 'delete', 'remove'])
// Directory/pattern search tools — their path args name dirs, never files.
const DIR_TOOLS = new Set(['glob', 'grep', 'search', 'ls', 'mkdir'])
// Arg keys that name a file (any tool). 'pattern' is glob input, never a file.
const FILE_KEYS = new Set(['path', 'file', 'filePath', 'file_path', 'filename'])

// omp reports paths in the host's own convention — drive-letter/UNC on Windows,
// POSIX everywhere else. The renderer has no `path` module, and hardcoding `\`
// left every macOS row showing a full absolute path as its "name" and rewrote
// relative paths into `\Users\...`, which the main process then refused to read.
// Derive the convention from the project dir instead, so this stays a pure
// module both platforms' tests can drive.
const WIN_ABS = /^[a-zA-Z]:[\\/]|^\\\\/

function isAbsolutePath(p: string): boolean {
  return WIN_ABS.test(p) || p.startsWith('/')
}

function separatorFor(projectDir: string): '\\' | '/' {
  return WIN_ABS.test(projectDir) ? '\\' : '/'
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : p
}

export function extractFileRefs(ev: Record<string, unknown>, projectDir: string): FileRef[] {
  if (ev.type !== 'tool_execution_start') return []
  // Real omp emits toolName; the mock fixture uses name. Accept both.
  const name = typeof ev.toolName === 'string' ? ev.toolName : typeof ev.name === 'string' ? ev.name : ''
  if (DIR_TOOLS.has(name)) return []
  const args = ev.args as Record<string, unknown> | undefined
  if (!args || typeof args !== 'object' || Array.isArray(args)) return []
  const out: FileRef[] = []
  const pushPath = (raw: unknown): void => {
    if (typeof raw !== 'string' || !raw) return
    if (raw.includes('*') || raw.includes('?')) return // glob pattern, not a file
    const sep = separatorFor(projectDir)
    const abs = isAbsolutePath(raw)
      ? raw
      : `${projectDir.replace(/[\\/]+$/, '')}${sep}${raw.replace(/[\\/]/g, sep)}`
    const base = basename(abs)
    out.push({ path: abs, name: base, modified: WRITE_TOOLS.has(name), firstSeenAt: Date.now() })
  }
  if (FILE_TOOLS.has(name)) {
    for (const [k, v] of Object.entries(args)) if (k.toLowerCase().endsWith('path') || FILE_KEYS.has(k)) pushPath(v)
  } else {
    for (const k of FILE_KEYS) pushPath(args[k])
  }
  return out
}

export function mergeFileRefs(prev: FileRef[], next: FileRef[]): FileRef[] {
  const map = new Map(prev.map((f) => [f.path, f]))
  for (const f of next) {
    const ex = map.get(f.path)
    map.set(f.path, ex ? { ...ex, modified: ex.modified || f.modified } : f)
  }
  return [...map.values()]
}
