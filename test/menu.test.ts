import { describe, expect, it, vi } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'
import type { MenuCommand } from '../src/shared/omp-api'

vi.mock('electron', () => ({
  app: { getName: () => 'Oh My Pi Desktop', getVersion: () => '0.2.0', showAboutPanel: () => {} },
  shell: { openExternal: () => {} },
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
  Menu: { buildFromTemplate: (t: unknown) => t, setApplicationMenu: () => {} }
}))

const { buildMenuTemplate } = await import('../src/main/menu')

type Item = MenuItemConstructorOptions
const submenu = (item: Item): Item[] => (Array.isArray(item.submenu) ? (item.submenu as Item[]) : [])

/** Every item in the tree, flattened — roles and labels can legitimately live
 *  at different depths on different platforms (Speech is nested, Cut is not). */
function flatten(template: Item[]): Item[] {
  return template.flatMap((item) => [item, ...flatten(submenu(item))])
}

function roles(template: Item[]): string[] {
  return flatten(template)
    .map((i) => i.role)
    .filter((r): r is NonNullable<Item['role']> => Boolean(r))
}

function labels(template: Item[]): string[] {
  return flatten(template)
    .map((i) => i.label)
    .filter((l): l is string => Boolean(l))
}

function click(template: Item[], label: string): void {
  const item = flatten(template).find((i) => i.label === label)
  if (!item?.click) throw new Error(`no clickable menu item labelled "${label}"`)
  item.click({} as never, undefined, {} as never)
}

describe('buildMenuTemplate', () => {
  it('puts the app menu first on macOS and nowhere on Windows', () => {
    const mac = buildMenuTemplate('darwin')
    expect(mac[0].label).toBe('Oh My Pi Desktop')
    expect(submenu(mac[0]).map((i) => i.role)).toContain('about')
    expect(submenu(mac[0]).map((i) => i.role)).toContain('quit')
    expect(mac.map((i) => i.label)).toEqual(['Oh My Pi Desktop', 'File', 'Edit', 'View', 'Window', 'Help'])

    const win = buildMenuTemplate('win32')
    expect(win[0].label).toBe('&File')
    expect(win.some((i) => i.label === 'Oh My Pi Desktop')).toBe(false)
    expect(roles(win)).toContain('quit')
  })

  it('carries the standard edit roles on both platforms', () => {
    // Without these macOS has no Cmd+C/V/A at all — Electron installs no
    // default menu there, so the roles are the only binding.
    for (const platform of ['darwin', 'win32', 'linux']) {
      const present = roles(buildMenuTemplate(platform))
      for (const role of ['undo', 'redo', 'cut', 'copy', 'paste', 'delete', 'selectAll']) {
        expect(present, `${role} missing on ${platform}`).toContain(role)
      }
    }
  })

  it('adds the mac-only edit and window roles', () => {
    const mac = roles(buildMenuTemplate('darwin'))
    expect(mac).toContain('pasteAndMatchStyle')
    expect(mac).toContain('startSpeaking')
    expect(mac).toContain('stopSpeaking')
    expect(mac).toContain('hide')
    expect(mac).toContain('hideOthers')
    expect(mac).toContain('unhide')
    expect(mac).toContain('services')
    expect(mac).toContain('front')

    const win = roles(buildMenuTemplate('win32'))
    expect(win).not.toContain('pasteAndMatchStyle')
    expect(win).not.toContain('startSpeaking')
    expect(win).not.toContain('front')
  })

  it('carries the view roles on both platforms', () => {
    for (const platform of ['darwin', 'win32']) {
      const present = roles(buildMenuTemplate(platform))
      for (const role of ['reload', 'toggleDevTools', 'resetZoom', 'zoomIn', 'zoomOut', 'togglefullscreen']) {
        expect(present, `${role} missing on ${platform}`).toContain(role)
      }
    }
  })

  it('strips Windows mnemonics from macOS labels', () => {
    expect(labels(buildMenuTemplate('darwin')).some((l) => l.includes('&'))).toBe(false)
    expect(labels(buildMenuTemplate('win32'))).toContain('&File')
  })

  it('uses CmdOrCtrl accelerators so both platforms bind correctly', () => {
    for (const platform of ['darwin', 'win32']) {
      const accelerators = flatten(buildMenuTemplate(platform))
        .map((i) => i.accelerator)
        .filter((a): a is string => Boolean(a))
      expect(accelerators.length).toBeGreaterThan(0)
      for (const accelerator of accelerators) {
        expect(accelerator, `${accelerator} on ${platform}`).toMatch(/^CmdOrCtrl\+/)
      }
    }
  })

  it('emits every app command with its documented id and shortcut', () => {
    const expected: [string, MenuCommand, string | undefined][] = [
      ['New Session', 'new_session', 'CmdOrCtrl+N'],
      ['Open Project…', 'open_project', 'CmdOrCtrl+O'],
      ['Command Palette', 'command_palette', 'CmdOrCtrl+K'],
      ['Focus Composer', 'focus_composer', 'CmdOrCtrl+L'],
      ['Export Session to HTML', 'export_html', undefined],
      ['Toggle Right Panel', 'toggle_right_panel', 'CmdOrCtrl+B'],
      ['Find in Transcript', 'find_in_transcript', 'CmdOrCtrl+F'],
      ['Preferences…', 'settings', 'CmdOrCtrl+,']
    ]
    const sent: MenuCommand[] = []
    const mac = buildMenuTemplate('darwin', (c) => sent.push(c))
    for (const [label, command, accelerator] of expected) {
      const item = flatten(mac).find((i) => i.label === label)
      expect(item, `${label} missing from the macOS menu`).toBeTruthy()
      expect(item?.accelerator).toBe(accelerator)
      click(mac, label)
      expect(sent.at(-1)).toBe(command)
    }
    expect(sent).toHaveLength(expected.length)
  })

  it('reaches the same commands on Windows, where Settings replaces Preferences', () => {
    const sent: MenuCommand[] = []
    const win = buildMenuTemplate('win32', (c) => sent.push(c))
    for (const label of ['New Session', 'Open Project…', 'Command Palette', 'Focus Composer', 'Settings']) {
      click(win, label)
    }
    expect(sent).toEqual(['new_session', 'open_project', 'command_palette', 'focus_composer', 'settings'])
  })
})
