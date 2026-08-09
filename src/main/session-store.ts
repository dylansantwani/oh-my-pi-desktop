import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export class ProjectMemory {
  private file: string
  constructor(baseDir: string) {
    this.file = join(baseDir, 'project.json')
  }
  recall(): string | null {
    try {
      if (!existsSync(this.file)) return null
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as { cwd?: unknown }
      if (typeof raw.cwd !== 'string' || !raw.cwd) return null
      // A project the user has since deleted (or an unmounted volume) would be
      // handed to spawn() as cwd, where the failure comes back as
      // `spawn omp ENOENT` and blames the binary for a missing directory.
      // Treat it as nothing remembered so the app falls back to onboarding.
      // statSync throws for a missing path — the catch below turns that into null.
      return statSync(raw.cwd).isDirectory() ? raw.cwd : null
    } catch {
      return null
    }
  }
  remember(cwd: string): void {
    mkdirSync(join(this.file, '..'), { recursive: true })
    writeFileSync(this.file, JSON.stringify({ cwd }, null, 2), 'utf8')
  }
  /** Pure: naming the default must not create it. First run used to leave an
   *  ~/omp-workspace behind merely because the renderer asked what the default
   *  was — see ensureDefaultProjectDir for where it is materialised. */
  defaultProjectDir(): string {
    return join(homedir(), 'omp-workspace')
  }
  /** Create the default workspace at the point something connects to it.
   *  Returns null when it cannot be created, so the caller can say that instead
   *  of spawning omp into a directory that isn't there. */
  ensureDefaultProjectDir(): string | null {
    const dir = this.defaultProjectDir()
    try {
      mkdirSync(dir, { recursive: true })
      return dir
    } catch {
      return null
    }
  }
}
