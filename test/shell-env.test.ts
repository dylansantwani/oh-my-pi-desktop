import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { spawnSync } from 'child_process'
import {
  applyShellPath,
  envWithShellPath,
  mergePaths,
  resetShellPathCache,
  resolveShellPath
} from '../src/main/shell-env'

vi.mock('child_process', () => ({ spawnSync: vi.fn() }))

const spawnSyncMock = vi.mocked(spawnSync)

/** A spawnSync result carrying `stdout`; the fields the module reads are the
 *  only ones filled in. */
function shellPrinted(stdout: string): void {
  spawnSyncMock.mockReturnValue({ status: 0, stdout, stderr: '' } as never)
}

function fenced(path: string): string {
  return `__OMP_PATH_START__${path}__OMP_PATH_END__`
}

const platformDesc = Object.getOwnPropertyDescriptor(process, 'platform')!

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { ...platformDesc, value: platform })
}

const origPath = process.env.PATH
const origShell = process.env.SHELL

beforeEach(() => {
  resetShellPathCache()
  spawnSyncMock.mockReset()
  setPlatform('darwin')
  process.env.PATH = '/usr/bin:/bin'
  process.env.SHELL = '/bin/zsh'
})

afterEach(() => {
  Object.defineProperty(process, 'platform', platformDesc)
  process.env.PATH = origPath
  if (origShell === undefined) delete process.env.SHELL
  else process.env.SHELL = origShell
})

describe('resolveShellPath', () => {
  it('runs the login shell once and reuses the answer', () => {
    shellPrinted(fenced('/Users/t/.local/bin:/usr/bin'))
    expect(resolveShellPath()).toBe('/Users/t/.local/bin:/usr/bin')
    expect(resolveShellPath()).toBe('/Users/t/.local/bin:/usr/bin')
    expect(spawnSyncMock).toHaveBeenCalledTimes(1)
    const [shell, args] = spawnSyncMock.mock.calls[0]
    expect(shell).toBe('/bin/zsh')
    expect(args).toEqual(['-l', '-i', '-c', expect.stringContaining('__OMP_PATH_START__')])
  })

  it('probes again after the cache is reset', () => {
    shellPrinted(fenced('/one'))
    expect(resolveShellPath()).toBe('/one')
    resetShellPathCache()
    shellPrinted(fenced('/two'))
    expect(resolveShellPath()).toBe('/two')
    expect(spawnSyncMock).toHaveBeenCalledTimes(2)
  })

  it('ignores rc-file banners around the markers', () => {
    shellPrinted(`nvm: using v22\n${fenced('/opt/homebrew/bin:/usr/bin')}\nWelcome!\n`)
    expect(resolveShellPath()).toBe('/opt/homebrew/bin:/usr/bin')
  })

  it('defaults to /bin/zsh on darwin when $SHELL is unset', () => {
    delete process.env.SHELL
    shellPrinted(fenced('/usr/bin'))
    resolveShellPath()
    expect(spawnSyncMock.mock.calls[0][0]).toBe('/bin/zsh')
  })

  it('returns process.env.PATH untouched on win32 without spawning anything', () => {
    setPlatform('win32')
    process.env.PATH = 'C:\\Windows;C:\\Windows\\System32'
    expect(resolveShellPath()).toBe('C:\\Windows;C:\\Windows\\System32')
    expect(spawnSyncMock).not.toHaveBeenCalled()
  })

  it.each([
    ['a spawn error', { error: new Error('ENOENT'), stdout: fenced('/never/read') }],
    ['missing markers', { status: 0, stdout: '/usr/bin:/bin' }],
    ['a truncated fence', { status: 0, stdout: '__OMP_PATH_START__/usr/bin' }],
    ['an empty value', { status: 0, stdout: fenced('') }],
    ['NUL bytes', { status: 0, stdout: fenced('/usr/bin\0/bin') }],
    ['no stdout at all', { status: 0, stdout: null }]
  ])('falls back to the inherited PATH on %s', (_label, result) => {
    spawnSyncMock.mockReturnValue(result as never)
    expect(resolveShellPath()).toBe('/usr/bin:/bin')
  })

  it('falls back to the inherited PATH when spawnSync throws', () => {
    spawnSyncMock.mockImplementation(() => {
      throw new Error('EMFILE')
    })
    expect(resolveShellPath()).toBe('/usr/bin:/bin')
  })

  it('keeps the shell PATH even when the login shell exits non-zero', () => {
    // A last rc line returning non-zero is common and says nothing about PATH.
    spawnSyncMock.mockReturnValue({ status: 1, stdout: fenced('/Users/t/.local/bin') } as never)
    expect(resolveShellPath()).toBe('/Users/t/.local/bin')
  })
})

describe('mergePaths', () => {
  it('keeps first occurrences, in order, dropping duplicates and blanks', () => {
    expect(mergePaths('/a:/b::/a', '/b:/c')).toBe('/a:/b:/c')
  })

  it('handles either side being empty', () => {
    expect(mergePaths('', '/a:/b')).toBe('/a:/b')
    expect(mergePaths('/a:/b', '')).toBe('/a:/b')
  })
})

describe('applyShellPath', () => {
  it('puts shell entries first and keeps inherited ones', () => {
    process.env.PATH = '/usr/bin:/bin:/usr/sbin:/sbin'
    shellPrinted(fenced('/Users/t/.local/bin:/opt/homebrew/bin:/usr/bin:/bin'))
    expect(applyShellPath()).toBe(
      '/Users/t/.local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin'
    )
    expect(process.env.PATH).toBe(
      '/Users/t/.local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin'
    )
  })

  it('leaves process.env.PATH alone on win32', () => {
    setPlatform('win32')
    process.env.PATH = 'C:\\Windows'
    expect(applyShellPath()).toBe('C:\\Windows')
    expect(process.env.PATH).toBe('C:\\Windows')
    expect(spawnSyncMock).not.toHaveBeenCalled()
  })
})

describe('envWithShellPath', () => {
  it('enriches PATH while leaving the rest of the env intact', () => {
    shellPrinted(fenced('/Users/t/.local/bin:/usr/bin'))
    const env = envWithShellPath({ PATH: '/usr/bin:/bin', FOO: 'bar' })
    expect(env.PATH).toBe('/Users/t/.local/bin:/usr/bin:/bin')
    expect(env.FOO).toBe('bar')
  })

  it('defaults to process.env', () => {
    shellPrinted(fenced('/Users/t/.local/bin'))
    expect(envWithShellPath().PATH).toBe('/Users/t/.local/bin:/usr/bin:/bin')
  })

  it('hands back the same object on win32 — a spread copy loses case-insensitivity', () => {
    setPlatform('win32')
    const base = { Path: 'C:\\Windows' }
    expect(envWithShellPath(base)).toBe(base)
  })
})
