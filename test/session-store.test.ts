import { describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ProjectMemory } from '../src/main/session-store'

// defaultProjectDir() is anchored at the user's home directory, and one of the
// assertions below is that merely naming it creates nothing — which would be
// untestable (and rude) against the real home.
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>()
  return { ...actual, homedir: () => join(actual.tmpdir(), 'omp-home-test') }
})

describe('ProjectMemory', () => {
  it('remembers and recalls the project', () => {
    const dir = mkdtempSync(join(tmpdir(), 'omp-mem-'))
    const project = mkdtempSync(join(tmpdir(), 'omp-proj-'))
    const mem = new ProjectMemory(dir)
    expect(mem.recall()).toBeNull()
    mem.remember(project)
    expect(mem.recall()).toBe(project)
    rmSync(dir, { recursive: true, force: true })
    rmSync(project, { recursive: true, force: true })
  })

  it('forgets a remembered project whose directory is gone', () => {
    const dir = mkdtempSync(join(tmpdir(), 'omp-mem-'))
    const project = mkdtempSync(join(tmpdir(), 'omp-proj-'))
    const mem = new ProjectMemory(dir)
    mem.remember(project)
    rmSync(project, { recursive: true, force: true })
    // Handing a deleted cwd to spawn() surfaces as `spawn omp ENOENT`, which
    // blames the binary — "nothing remembered" is the honest answer.
    expect(mem.recall()).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })

  it('names the default workspace without creating it', () => {
    const home = join(tmpdir(), 'omp-home-test')
    rmSync(home, { recursive: true, force: true })
    const mem = new ProjectMemory(mkdtempSync(join(tmpdir(), 'omp-mem-')))
    const workspace = mem.defaultProjectDir()
    expect(workspace).toBe(join(home, 'omp-workspace'))
    expect(existsSync(workspace)).toBe(false)
    // ...and only materialises it when something is about to connect there.
    expect(mem.ensureDefaultProjectDir()).toBe(workspace)
    expect(existsSync(workspace)).toBe(true)
    rmSync(home, { recursive: true, force: true })
  })
})
