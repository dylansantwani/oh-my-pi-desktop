import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { DEFAULT_SETTINGS, SettingsStore, sanitizeSettings } from '../src/main/settings-store'

function store(): { dir: string; s: SettingsStore } {
  const dir = mkdtempSync(join(tmpdir(), 'omp-settings-'))
  return { dir, s: new SettingsStore(dir) }
}

describe('sanitizeSettings', () => {
  it('returns defaults for null, non-objects, and empty input', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings('nope')).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings({})).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps valid fields and defaults only the invalid ones', () => {
    const out = sanitizeSettings({ theme: 'light', fontSize: 'huge', notifyOnTurnEnd: false })
    expect(out.theme).toBe('light')
    expect(out.notifyOnTurnEnd).toBe(false)
    expect(out.fontSize).toBe(DEFAULT_SETTINGS.fontSize)
  })

  it('rejects an unknown theme', () => {
    expect(sanitizeSettings({ theme: 'solarized' }).theme).toBe('system')
  })

  it('clamps fontSize into the supported range and rounds it', () => {
    expect(sanitizeSettings({ fontSize: 2 }).fontSize).toBe(11)
    expect(sanitizeSettings({ fontSize: 999 }).fontSize).toBe(20)
    expect(sanitizeSettings({ fontSize: 14.6 }).fontSize).toBe(15)
    expect(sanitizeSettings({ fontSize: NaN }).fontSize).toBe(DEFAULT_SETTINGS.fontSize)
  })

  it('normalizes a blank ompPathOverride to null and trims a real one', () => {
    expect(sanitizeSettings({ ompPathOverride: '   ' }).ompPathOverride).toBeNull()
    expect(sanitizeSettings({ ompPathOverride: 42 }).ompPathOverride).toBeNull()
    expect(sanitizeSettings({ ompPathOverride: ' /usr/bin/omp ' }).ompPathOverride).toBe('/usr/bin/omp')
  })
})

describe('SettingsStore', () => {
  it('returns defaults when no file exists', () => {
    const { s } = store()
    expect(s.get()).toEqual(DEFAULT_SETTINGS)
  })

  it('persists an update and reads it back from disk in a fresh store', () => {
    const { dir, s } = store()
    s.update({ theme: 'dark', fontSize: 18 })
    const reloaded = new SettingsStore(dir).get()
    expect(reloaded.theme).toBe('dark')
    expect(reloaded.fontSize).toBe(18)
  })

  it('merges patches instead of replacing the whole object', () => {
    const { s } = store()
    s.update({ theme: 'light' })
    const out = s.update({ fontSize: 16 })
    expect(out.theme).toBe('light')
    expect(out.fontSize).toBe(16)
  })

  it('falls back to defaults on a corrupt file rather than throwing', () => {
    const { dir } = store()
    writeFileSync(join(dir, 'settings.json'), '{ not json', 'utf8')
    expect(new SettingsStore(dir).get()).toEqual(DEFAULT_SETTINGS)
  })

  it('does not leave a .tmp file behind after a write', () => {
    const { dir, s } = store()
    s.update({ theme: 'dark' })
    expect(() => readFileSync(join(dir, 'settings.json.tmp'), 'utf8')).toThrow()
  })

  it('reset restores every default', () => {
    const { s } = store()
    s.update({ theme: 'dark', fontSize: 20, notifyOnTurnEnd: false })
    expect(s.reset()).toEqual(DEFAULT_SETTINGS)
  })
})
