import { stat, readFile } from 'fs/promises'
import { resolve, sep } from 'path'
import type { ReadFileResult } from '../shared/omp-api'

export const PREVIEW_LIMIT = 512 * 1024

export async function readProjectFile(root: string, filePath: string): Promise<ReadFileResult> {
  if (typeof filePath !== 'string' || !filePath) return { ok: false, error: 'invalid path' }
  const abs = resolve(filePath)
  const base = resolve(root)
  if (abs !== base && !abs.startsWith(base + sep)) return { ok: false, error: 'path is outside the project' }
  try {
    const st = await stat(abs)
    if (!st.isFile()) return { ok: false, error: 'not a file' }
    if (st.size > PREVIEW_LIMIT) return { ok: false, error: 'file too large to preview' }
    const content = await readFile(abs, 'utf8')
    return { ok: true, content, size: st.size }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    return { ok: false, error: code === 'ENOENT' ? 'file not found' : (e as Error).message }
  }
}
