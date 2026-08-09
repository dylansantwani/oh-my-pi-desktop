import { describe, expect, it, vi } from 'vitest'
import { join } from 'path'

// ipc.ts pulls in electron for its handlers, but defaultSessionDir only reaches
// app.getPath — a stub is enough to import the module outside an Electron run.
vi.mock('electron', () => ({
  app: { getPath: (name: string) => (name === 'home' ? '/Users/tester' : '/tmp') },
  dialog: {},
  ipcMain: { handle: () => {} },
  BrowserWindow: { getAllWindows: () => [], getFocusedWindow: () => null },
  Notification: { isSupported: () => false }
}))

const { defaultSessionDir } = await import('../src/main/ipc')

describe('defaultSessionDir', () => {
  it('joins the segments with the platform separator', () => {
    expect(defaultSessionDir()).toBe(join('/Users/tester', '.omp', 'agent', 'sessions'))
  })

  it('produces a posix path on posix — the regression that hid every session on macOS', () => {
    if (process.platform === 'win32') return
    expect(defaultSessionDir()).toBe('/Users/tester/.omp/agent/sessions')
    expect(defaultSessionDir()).not.toContain('\\')
  })

  it('nests four levels deep rather than making one literal directory name', () => {
    const segments = defaultSessionDir().split(/[\\/]/).filter(Boolean)
    expect(segments.slice(-3)).toEqual(['.omp', 'agent', 'sessions'])
  })
})
