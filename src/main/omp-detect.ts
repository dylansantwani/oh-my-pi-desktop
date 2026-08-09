import { accessSync, constants } from 'fs'
import { homedir } from 'os'
import { posix, win32 } from 'path'
import { spawnSync } from 'child_process'
import { envWithShellPath } from './shell-env'

/** Install locations worth probing before falling back to a PATH search, most
 *  likely first. Kept strictly per-platform — a Windows shim can never exist on
 *  darwin, and probing for one only buys a wasted stat. Pure (platform, home)
 *  in, list out, so tests don't inherit the host's platform or homedir. */
export function candidatePaths(platform: NodeJS.Platform, home: string): string[] {
  if (platform === 'win32') {
    return [
      win32.join(home, '.bun', 'bin', 'omp.exe'),
      win32.join(home, '.local', 'bin', 'omp.cmd'),
      win32.join(home, '.local', 'bin', 'omp.exe'),
      win32.join(home, '.local', 'npm', 'omp.cmd'),
      'C:\\Program Files\\Oh My Pi\\omp.exe'
    ]
  }
  return [
    posix.join(home, '.local', 'bin', 'omp'),
    posix.join(home, '.bun', 'bin', 'omp'),
    posix.join(home, '.npm-global', 'bin', 'omp'),
    '/opt/homebrew/bin/omp',
    '/usr/local/bin/omp',
    posix.join(home, '.cargo', 'bin', 'omp'),
    '/usr/bin/omp'
  ]
}

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
        : spawnSync(candidate, ['--version'], {
            timeout: 5000,
            stdio: 'ignore',
            // omp shells out while answering --version; under a Finder launch the
            // inherited PATH is too bare for that to succeed. No-op on Windows,
            // where envWithShellPath hands back process.env itself.
            env: envWithShellPath()
          })
    return res.status === 0
  } catch {
    return false
  }
}

/** Everything named `omp` on PATH. Windows asks `where` and filters to the
 *  executable forms; POSIX asks `which -a` under the login-shell PATH, because
 *  the PATH this process inherited from Finder wouldn't contain ~/.local/bin. */
function pathLookup(): string[] {
  try {
    if (process.platform === 'win32') {
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
    }
    const res = spawnSync('which', ['-a', 'omp'], {
      timeout: 5000,
      encoding: 'utf8',
      env: envWithShellPath()
    })
    if (res.status !== 0 || !res.stdout) return []
    return res.stdout
      .split('\n')
      .map((s) => s.trim())
      // Absolute paths only: a miss prints prose ("omp not found") rather than
      // nothing on some `which` builds.
      .filter((s) => s.startsWith('/'))
  } catch {
    return []
  }
}

export function findOmp(): string | null {
  const explicit = candidatePaths(process.platform, homedir())
  for (const candidate of [...explicit, ...pathLookup()]) {
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
