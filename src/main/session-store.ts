import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
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
      return typeof raw.cwd === 'string' && raw.cwd ? raw.cwd : null
    } catch {
      return null
    }
  }
  remember(cwd: string): void {
    mkdirSync(join(this.file, '..'), { recursive: true })
    writeFileSync(this.file, JSON.stringify({ cwd }, null, 2), 'utf8')
  }
  defaultProjectDir(): string {
    const dir = join(homedir(), 'omp-workspace')
    try {
      mkdirSync(dir, { recursive: true })
    } catch {
      /* connect() surfaces the real failure if the dir is unusable */
    }
    return dir
  }
}
