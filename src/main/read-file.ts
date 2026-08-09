import { stat, readFile } from 'fs/promises'
import { resolve, sep } from 'path'
import type { ReadFileResult } from '../shared/omp-api'

export const PREVIEW_LIMIT = 512 * 1024

/** How far in to look for the NUL byte that marks a file as binary. Same window
 *  git uses; real source files never contain one, so the scan costs nothing. */
const BINARY_SNIFF_BYTES = 8192

export function looksBinary(buf: Buffer): boolean {
  const end = Math.min(buf.length, BINARY_SNIFF_BYTES)
  for (let i = 0; i < end; i++) {
    if (buf[i] === 0) return true
  }
  return false
}

function kb(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`
}

export async function readProjectFile(root: string, filePath: string): Promise<ReadFileResult> {
  if (typeof filePath !== 'string' || !filePath) return { ok: false, error: 'invalid path' }
  const abs = resolve(filePath)
  const base = resolve(root)
  if (abs !== base && !abs.startsWith(base + sep)) return { ok: false, error: 'path is outside the project' }
  try {
    const st = await stat(abs)
    if (!st.isFile()) return { ok: false, error: 'not a file' }
    // Say how far past the limit it is — "too large" alone gives the user no way
    // to judge whether opening it elsewhere is even worth trying.
    if (st.size > PREVIEW_LIMIT) {
      return { ok: false, error: `file too large to preview (${kb(st.size)}, limit ${kb(PREVIEW_LIMIT)})` }
    }
    const buf = await readFile(abs)
    // Decoding a PNG as UTF-8 "succeeds": it hands the viewer half a megabyte of
    // mojibake instead of failing. Refuse before any of it reaches the renderer.
    if (looksBinary(buf)) return { ok: false, error: 'binary file — no text preview available' }
    return { ok: true, content: buf.toString('utf8'), size: st.size }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    return { ok: false, error: code === 'ENOENT' ? 'file not found' : (e as Error).message }
  }
}
