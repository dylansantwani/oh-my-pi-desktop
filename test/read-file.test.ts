import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readProjectFile } from '../src/main/read-file'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'omp-read-'))
  mkdirSync(join(root, 'sub'))
  writeFileSync(join(root, 'a.txt'), 'hello')
  writeFileSync(join(root, 'sub', 'b.txt'), 'nested')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('readProjectFile', () => {
  it('reads a file inside the project root', async () => {
    const res = await readProjectFile(root, join(root, 'a.txt'))
    expect(res).toEqual({ ok: true, content: 'hello', size: 5 })
  })
  it('rejects paths outside the root (.. escape)', async () => {
    const res = await readProjectFile(root, join(root, '..', 'escape.txt'))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/outside/i)
  })
  it('rejects absolute paths outside the root', async () => {
    const res = await readProjectFile(root, join(tmpdir(), 'somewhere-else.txt'))
    expect(res.ok).toBe(false)
  })
  it('returns file-not-found for missing files', async () => {
    const res = await readProjectFile(root, join(root, 'nope.txt'))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/not found/i)
  })
  it('refuses binary content instead of returning mojibake', async () => {
    // A PNG header: the NUL bytes are what the sniff keys off.
    writeFileSync(join(root, 'pic.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]))
    const res = await readProjectFile(root, join(root, 'pic.png'))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/binary/i)
  })

  it('still reads text that merely looks unusual (utf-8, long lines)', async () => {
    writeFileSync(join(root, 'utf.txt'), 'héllo — ünicode ✓\n'.repeat(500), 'utf8')
    const res = await readProjectFile(root, join(root, 'utf.txt'))
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.content).toContain('ünicode ✓')
  })

  it('rejects directories and oversized files', async () => {
    const dir = await readProjectFile(root, join(root, 'sub'))
    expect(dir.ok).toBe(false)
    writeFileSync(join(root, 'big.bin'), Buffer.alloc(600 * 1024))
    const big = await readProjectFile(root, join(root, 'big.bin'))
    expect(big.ok).toBe(false)
    if (!big.ok) expect(big.error).toMatch(/too large/i)
  })
})
