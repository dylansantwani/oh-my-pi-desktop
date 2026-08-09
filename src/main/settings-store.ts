import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import type { AppSettings, ThemeMode } from '../shared/omp-api'

export type { AppSettings, ThemeMode }

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  fontSize: 14,
  notifyOnTurnEnd: true,
  autoCheckUpdates: true,
  ompPathOverride: null
}

const FONT_SIZE_MIN = 11
const FONT_SIZE_MAX = 20
const THEMES: ThemeMode[] = ['system', 'dark', 'light']

/** Settings are user-editable on disk and survive downgrades, so every field is
 *  validated independently rather than trusting the file's shape. A single bad
 *  value falls back to its default instead of discarding the whole file. */
export function sanitizeSettings(raw: unknown): AppSettings {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const theme = THEMES.includes(obj.theme as ThemeMode) ? (obj.theme as ThemeMode) : DEFAULT_SETTINGS.theme
  const size = typeof obj.fontSize === 'number' && Number.isFinite(obj.fontSize) ? Math.round(obj.fontSize) : DEFAULT_SETTINGS.fontSize
  const override = typeof obj.ompPathOverride === 'string' && obj.ompPathOverride.trim() ? obj.ompPathOverride.trim() : null
  return {
    theme,
    fontSize: Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, size)),
    notifyOnTurnEnd: typeof obj.notifyOnTurnEnd === 'boolean' ? obj.notifyOnTurnEnd : DEFAULT_SETTINGS.notifyOnTurnEnd,
    autoCheckUpdates: typeof obj.autoCheckUpdates === 'boolean' ? obj.autoCheckUpdates : DEFAULT_SETTINGS.autoCheckUpdates,
    ompPathOverride: override
  }
}

export class SettingsStore {
  private file: string
  private cache: AppSettings | null = null

  constructor(baseDir: string) {
    this.file = join(baseDir, 'settings.json')
  }

  get(): AppSettings {
    if (this.cache) return this.cache
    let parsed: unknown = null
    try {
      if (existsSync(this.file)) parsed = JSON.parse(readFileSync(this.file, 'utf8'))
    } catch {
      /* corrupt or unreadable — sanitize() turns null into the defaults */
    }
    this.cache = sanitizeSettings(parsed)
    return this.cache
  }

  /** Merge a partial update, persist, and return the resulting settings. */
  update(patch: Partial<AppSettings>): AppSettings {
    const next = sanitizeSettings({ ...this.get(), ...patch })
    this.cache = next
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      // Write-then-rename so a crash mid-write can't leave a truncated file that
      // the next launch would silently reset to defaults.
      const tmp = `${this.file}.tmp`
      writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8')
      renameSync(tmp, this.file)
    } catch {
      /* persistence is best-effort; the in-memory value still applies this run */
    }
    return next
  }

  reset(): AppSettings {
    return this.update(DEFAULT_SETTINGS)
  }
}
