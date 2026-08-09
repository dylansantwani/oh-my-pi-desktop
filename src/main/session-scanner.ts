import { readdirSync, readFileSync, realpathSync, statSync } from 'fs'
import { join } from 'path'

export interface SessionSummary {
  path: string
  title: string
  cwd: string
  mtimeMs: number
  sizeBytes: number
}

const TITLE_SLOT_BYTES = 256

/** Canonical form for comparing a session header's `cwd` against a project dir.
 *  omp writes whichever separator the host used, so both sides are unified to
 *  '/' before comparing; a trailing separator is dropped so ".../proj" and
 *  ".../proj/" group together. Case is folded because both platforms this app
 *  ships on — Windows and macOS — use case-insensitive filesystems by default. */
function normalizeCwd(cwd: string): string {
  const unified = cwd.replaceAll('\\', '/')
  const trimmed = unified.length > 1 ? unified.replace(/\/+$/, '') : unified
  return trimmed.toLowerCase()
}

/** Both spellings of a path, canonicalized: the literal one and its symlink-
 *  resolved form. On macOS `/tmp`, `/var`, and `/etc` are symlinks into
 *  `/private`, so a session started by the `omp` CLI in `/tmp/proj` records that
 *  literally while the desktop app's folder picker hands back
 *  `/private/tmp/proj`. Comparing both spellings is what lets the same project
 *  group whether its sessions came from the CLI or the GUI. Paths that no
 *  longer exist simply contribute no resolved form. */
function cwdKeys(cwd: string): string[] {
  const keys = [normalizeCwd(cwd)]
  try {
    const real = normalizeCwd(realpathSync(cwd))
    if (real !== keys[0]) keys.push(real)
  } catch {
    /* deleted or unreadable — the literal spelling is all we can match on */
  }
  return keys
}

function parseFirstJsonLine(text: string): Record<string, unknown> | null {
  // A line may be padded to a fixed width with trailing whitespace; parse leniently.
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    try {
      const obj = JSON.parse(line)
      if (obj && typeof obj === 'object') return obj as Record<string, unknown>
    } catch {
      return null
    }
  }
  return null
}

export function scanSessions(baseDir: string, projectCwd: string): SessionSummary[] {
  const targets = new Set(cwdKeys(projectCwd))
  const results: SessionSummary[] = []
  let buckets: string[]
  try {
    buckets = readdirSync(baseDir)
  } catch {
    return []
  }
  for (const bucket of buckets) {
    const bucketDir = join(baseDir, bucket)
    let files: string[]
    try {
      if (!statSync(bucketDir).isDirectory()) continue
      files = readdirSync(bucketDir)
    } catch {
      continue
    }
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue
      const path = join(bucketDir, file)
      let st
      try {
        st = statSync(path)
      } catch {
        continue
      }
      let head = ''
      try {
        head = readFileSync(path, { encoding: 'utf8' }).slice(0, 64 * 1024)
      } catch {
        continue
      }
      let text = head
      // Strip the fixed-width title slot when the head does not already parse as a session header.
      if (text.length > TITLE_SLOT_BYTES) {
        const first = parseFirstJsonLine(text)
        if (first === null || first.type !== 'session') text = text.slice(TITLE_SLOT_BYTES)
      }
      const hdr = parseFirstJsonLine(text)
      if (!hdr || hdr.type !== 'session' || typeof hdr.cwd !== 'string') continue
      if (!cwdKeys(hdr.cwd).some((k) => targets.has(k))) continue
      results.push({
        path,
        title: typeof hdr.title === 'string' && hdr.title ? hdr.title : file,
        cwd: hdr.cwd,
        mtimeMs: st.mtimeMs,
        sizeBytes: st.size
      })
    }
  }
  results.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return results
}
