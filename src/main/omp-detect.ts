import { accessSync, constants } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { spawnSync } from 'child_process'

const CANDIDATES = [
  'omp',
  join(homedir(), '.bun', 'bin', 'omp.exe'),
  join(homedir(), '.local', 'bin', 'omp'),
  'C:\\Program Files\\Oh My Pi\\omp.exe'
]

export function findOmp(): string | null {
  for (const candidate of CANDIDATES) {
    try {
      const res = spawnSync(candidate, ['--version'], { stdio: 'ignore', timeout: 5000, windowsHide: true })
      if (res.status === 0) return candidate
    } catch {
      /* try next */
    }
    if (candidate !== 'omp') {
      try {
        accessSync(candidate, constants.X_OK)
        return candidate
      } catch {
        /* not present */
      }
    }
  }
  return null
}
