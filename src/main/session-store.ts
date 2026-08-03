import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
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
}
