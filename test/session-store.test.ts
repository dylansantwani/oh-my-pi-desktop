import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ProjectMemory } from '../src/main/session-store'

describe('ProjectMemory', () => {
  it('remembers, recalls, and clears the project', () => {
    const dir = mkdtempSync(join(tmpdir(), 'omp-mem-'))
    const mem = new ProjectMemory(dir)
    expect(mem.recall()).toBeNull()
    mem.remember('C:\\Users\\dylan\\downloads\\claude')
    expect(mem.recall()).toBe('C:\\Users\\dylan\\downloads\\claude')
    mem.clear()
    expect(mem.recall()).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })
})
