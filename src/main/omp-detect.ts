import { accessSync, constants } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { spawnSync } from 'child_process'

const EXPLICIT_CANDIDATES = [
  join(homedir(), '.bun', 'bin', 'omp.exe'),
  join(homedir(), '.local', 'bin', 'omp.cmd'),
  join(homedir(), '.local', 'bin', 'omp.exe'),
  join(homedir(), '.local', 'npm', 'omp.cmd'),
  'C:\\Program Files\\Oh My Pi\\omp.exe'
]

/** True when `candidate --version` exits 0. On Windows, npm/bun shims are
 *  .cmd batch files and can only run under cmd.exe — plain spawnSync ENOENTs.
 *  windowsVerbatimArguments keeps the quoting intact (Node escapes embedded
 *  quotes into \" otherwise, which cmd.exe rejects). */
function versionCheck(candidate: string): boolean {
  try {
    const res =
      process.platform === 'win32' && /\.(cmd|bat)$/i.test(candidate)
        ? spawnSync('cmd.exe', ['/d', '/s', '/c', `""${candidate}" --version"`], {
            windowsHide: true,
            windowsVerbatimArguments: true,
            timeout: 5000,
            stdio: 'ignore'
          })
        : spawnSync(candidate, ['--version'], { timeout: 5000, stdio: 'ignore' })
    return res.status === 0
  } catch {
    return false
  }
}

/** Everything named `omp` on PATH, filtered to Windows-executable forms. */
function pathLookup(): string[] {
  if (process.platform !== 'win32') return []
  try {
    const res = spawnSync('cmd.exe', ['/d', '/s', '/c', 'where omp'], {
      windowsHide: true,
      timeout: 5000,
      encoding: 'utf8'
    })
    if (res.status !== 0 || !res.stdout) return []
    return res.stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && /\.(exe|cmd|bat)$/i.test(s))
  } catch {
    return []
  }
}

export function findOmp(): string | null {
  for (const candidate of [...EXPLICIT_CANDIDATES, ...pathLookup()]) {
    let present = false
    try {
      accessSync(candidate, constants.X_OK)
      present = true
    } catch {
      /* not present */
    }
    if (present && versionCheck(candidate)) return candidate
  }
  // Last resort — bare name. Works on POSIX PATHs and on Windows when an
  // omp.exe is on PATH; .cmd-only Windows installs are caught above.
  if (versionCheck('omp')) return 'omp'
  return null
}
