import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

export interface SessionSummary {
  path: string
  title: string
  cwd: string
  mtimeMs: number
  sizeBytes: number
}

const TITLE_SLOT_BYTES = 256

function normalizeCwd(cwd: string): string {
  return cwd.replaceAll('/', '\\').toLowerCase()
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
  const target = normalizeCwd(projectCwd)
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
      if (normalizeCwd(hdr.cwd) !== target) continue
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
