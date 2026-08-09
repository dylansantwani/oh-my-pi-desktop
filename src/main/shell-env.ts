import { spawnSync } from 'child_process'
import { delimiter } from 'path'

const MARKER_START = '__OMP_PATH_START__'
const MARKER_END = '__OMP_PATH_END__'
const PROBE_TIMEOUT_MS = 5000

let probed = false
let probedPath: string | null = null

/** Pull the fenced PATH out of whatever the shell printed. An empty value or
 *  one carrying NUL bytes is the probe misfiring, not a PATH — reject both. */
function extractPath(out: string): string | null {
  const start = out.indexOf(MARKER_START)
  if (start < 0) return null
  const from = start + MARKER_START.length
  const end = out.indexOf(MARKER_END, from)
  if (end < 0) return null
  const value = out.slice(from, end)
  if (value.length === 0 || value.includes('\0')) return null
  return value
}

/** Ask the user's login shell what PATH a terminal would get.
 *
 *  An .app launched from Finder/Dock inherits launchd's minimal PATH
 *  (/usr/bin:/bin:/usr/sbin:/sbin) — none of the places a user actually
 *  installs omp are on it, so the real one has to be reconstructed. Both -l and
 *  -i are passed because PATH is exported from .zshrc/.bashrc (interactive) at
 *  least as often as from .zprofile/.profile (login); only running as both
 *  picks up either.
 *
 *  The value is fenced between markers because -i invites rc-file banners,
 *  version-manager chatter and MOTDs onto stdout alongside it. */
function probeLoginShellPath(): string | null {
  const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/sh')
  // ${PATH}, not $PATH: the marker's leading underscores are valid identifier
  // characters, so the shell would otherwise expand a variable that never exists.
  const script = `printf '%s' "${MARKER_START}\${PATH}${MARKER_END}"`
  try {
    const res = spawnSync(shell, ['-l', '-i', '-c', script], {
      timeout: PROBE_TIMEOUT_MS,
      encoding: 'utf8',
      // stdin ignored: an rc file that reads it would otherwise block until the
      // timeout. stderr ignored: banners there are noise we never parse.
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true
    })
    // Exit status is deliberately not checked — a login shell whose last rc line
    // returns non-zero still printed a perfectly good PATH, and the markers are
    // what prove the output is ours. res.error covers ENOENT and the timeout.
    if (res.error) return null
    return extractPath(typeof res.stdout === 'string' ? res.stdout : '')
  } catch {
    return null
  }
}

/** The user's real login-shell PATH, or process.env.PATH when it can't be had.
 *  Cached: the probe spawns a shell and costs 100-300 ms. Never throws. */
export function resolveShellPath(): string {
  const inherited = process.env.PATH ?? ''
  if (process.platform === 'win32') return inherited
  if (!probed) {
    probed = true
    probedPath = probeLoginShellPath()
  }
  return probedPath ?? inherited
}

/** Test hook — drops the memoised probe result. */
export function resetShellPathCache(): void {
  probed = false
  probedPath = null
}

/** Concatenate two PATHs: first occurrence of an entry wins, relative order is
 *  otherwise preserved, empty segments are dropped. */
export function mergePaths(primary: string, secondary: string): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of `${primary}${delimiter}${secondary}`.split(delimiter)) {
    if (entry.length === 0 || seen.has(entry)) continue
    seen.add(entry)
    out.push(entry)
  }
  return out.join(delimiter)
}

/** Merge the login-shell PATH into this process's own. Shell entries lead so
 *  lookups resolve the way they would in the user's terminal; whatever we
 *  inherited is kept, just after. Returns the PATH now in effect. */
export function applyShellPath(): string {
  if (process.platform === 'win32') return process.env.PATH ?? ''
  const merged = mergePaths(resolveShellPath(), process.env.PATH ?? '')
  process.env.PATH = merged
  return merged
}

/** `base` with its PATH enriched, for handing to spawn/spawnSync. Returns base
 *  untouched on Windows: process.env there is case-insensitive but a spread of
 *  it is not, so writing PATH onto the copy can leave a child holding both
 *  `Path` and `PATH`. */
export function envWithShellPath(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  if (process.platform === 'win32') return base
  return { ...base, PATH: mergePaths(resolveShellPath(), base.PATH ?? '') }
}
