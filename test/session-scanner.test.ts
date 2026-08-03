import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, utimesSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { scanSessions } from '../src/main/session-scanner'

function makeSessionDir(): string {
  return mkdtempSync(join(tmpdir(), 'omp-scan-'))
}

function header(cwd: string): string {
  return JSON.stringify({ type: 'session', version: 3, id: 'abc12345', timestamp: '2026-08-03T00:00:00.000Z', cwd, title: 'My Session' })
}

describe('scanSessions', () => {
  it('lists only sessions whose header cwd matches the project (case-insensitive)', () => {
    const dir = makeSessionDir()
    const bucket = join(dir, 'abs-claude-hash')
    mkdirSync(bucket, { recursive: true })
    const a = join(bucket, '1_aaaa.jsonl')
    const b = join(bucket, '2_bbbb.jsonl')
    const other = join(bucket, '3_cccc.jsonl')
    const titleSlot = JSON.stringify({ type: 'title', title: 'My Session' }).padEnd(256, ' ') + '\n'
    writeFileSync(a, titleSlot + header('C:\\Users\\Dylan\\downloads\\claude') + '\n')
    writeFileSync(b, titleSlot + header('C:\\Users\\dylan\\downloads\\claude') + '\n')
    writeFileSync(other, titleSlot + header('C:\\Users\\dylan\\other\\project') + '\n')
    // Pin mtimes: Windows filesystem timestamps can share a tick for rapid writes.
    utimesSync(a, new Date(), new Date(Date.now() - 60_000))
    utimesSync(b, new Date(), new Date(Date.now()))
    const out = scanSessions(dir, 'c:\\users\\dylan\\downloads\\claude')
    expect(out.map((s) => s.path)).toEqual([expect.stringContaining('2_bbbb'), expect.stringContaining('1_aaaa')])
    expect(out[0].title).toBe('My Session')
    expect(out[0].cwd.toLowerCase()).toContain('claude')
  })

  it('handles legacy files without a title slot', () => {
    const dir = makeSessionDir()
    const bucket = join(dir, 'abs-x')
    mkdirSync(bucket, { recursive: true })
    const f = join(bucket, '1_legacy.jsonl')
    writeFileSync(f, header('C:\\Users\\dylan\\downloads\\claude') + '\n')
    const out = scanSessions(dir, 'C:\\Users\\dylan\\downloads\\claude')
    expect(out).toHaveLength(1)
  })

  it('skips corrupt files and empty directories', () => {
    const dir = makeSessionDir()
    const bucket = join(dir, 'abs-x')
    mkdirSync(bucket, { recursive: true })
    writeFileSync(join(bucket, '1_bad.jsonl'), 'not json at all\n')
    expect(scanSessions(dir, 'C:\\Users\\dylan\\downloads\\claude')).toEqual([])
  })

  it('sorts by mtime descending', () => {
    const dir = makeSessionDir()
    const bucket = join(dir, 'abs-x')
    mkdirSync(bucket, { recursive: true })
    const old = join(bucket, '1_old.jsonl')
    const fresh = join(bucket, '2_fresh.jsonl')
    const body = header('C:\\Users\\dylan\\downloads\\claude') + '\n'
    writeFileSync(old, body)
    writeFileSync(fresh, body)
    utimesSync(fresh, new Date(), new Date(Date.now() + 60_000))
    utimesSync(old, new Date(), new Date(Date.now() - 60_000))
    const out = scanSessions(dir, 'C:\\Users\\dylan\\downloads\\claude')
    expect(out.map((s) => s.path)).toEqual([fresh, old])
  })
})
