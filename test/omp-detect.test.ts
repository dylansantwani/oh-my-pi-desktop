import { describe, expect, it } from 'vitest'
import { candidatePaths } from '../src/main/omp-detect'

describe('candidatePaths', () => {
  it('probes POSIX install locations on darwin, user-local first', () => {
    expect(candidatePaths('darwin', '/Users/tester')).toEqual([
      '/Users/tester/.local/bin/omp',
      '/Users/tester/.bun/bin/omp',
      '/Users/tester/.npm-global/bin/omp',
      '/opt/homebrew/bin/omp',
      '/usr/local/bin/omp',
      '/Users/tester/.cargo/bin/omp',
      '/usr/bin/omp'
    ])
  })

  it('gives linux the same POSIX list', () => {
    expect(candidatePaths('linux', '/home/tester')).toEqual(candidatePaths('darwin', '/home/tester'))
  })

  it('probes the shims and Program Files on win32', () => {
    expect(candidatePaths('win32', 'C:\\Users\\tester')).toEqual([
      'C:\\Users\\tester\\.bun\\bin\\omp.exe',
      'C:\\Users\\tester\\.local\\bin\\omp.cmd',
      'C:\\Users\\tester\\.local\\bin\\omp.exe',
      'C:\\Users\\tester\\.local\\npm\\omp.cmd',
      'C:\\Program Files\\Oh My Pi\\omp.exe'
    ])
  })

  it('never leaks one platform\u2019s paths into the other', () => {
    expect(candidatePaths('darwin', '/Users/tester').some((p) => /\.(exe|cmd|bat)$/i.test(p))).toBe(
      false
    )
    expect(candidatePaths('win32', 'C:\\Users\\tester').some((p) => p.startsWith('/'))).toBe(false)
  })

  it('is pure — the same input twice gives an equal list', () => {
    expect(candidatePaths('darwin', '/Users/a')).toEqual(candidatePaths('darwin', '/Users/a'))
    expect(candidatePaths('darwin', '/Users/a')).not.toEqual(candidatePaths('darwin', '/Users/b'))
  })
})
