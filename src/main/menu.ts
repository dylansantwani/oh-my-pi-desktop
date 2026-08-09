import { app, BrowserWindow, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import { MENU_COMMAND_CHANNEL, type MenuCommand } from '../shared/omp-api'

const HOMEPAGE = 'https://oh-my-pi-desktop.pulse-core.com'

/** Deliver a menu pick to whichever window the user is looking at. macOS keeps
 *  the menu bar alive with every window closed, so "no window" is a normal
 *  state here, not an error — drop the command rather than throw. */
function emit(command: MenuCommand): void {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (!win || win.isDestroyed()) return
  win.webContents.send(MENU_COMMAND_CHANNEL, command)
}

/** Build the platform's menu template. Split out from installing it so the
 *  shape can be asserted in tests without an Electron runtime. */
export function buildMenuTemplate(
  platform: string = process.platform,
  send: (command: MenuCommand) => void = emit
): MenuItemConstructorOptions[] {
  const isMac = platform === 'darwin'
  // `&` marks the Alt mnemonic on Windows/Linux; macOS renders it literally.
  const mnemonic = (text: string): string => (isMac ? text.replace('&', '') : text)
  const item = (label: string, command: MenuCommand, accelerator?: string): MenuItemConstructorOptions => ({
    label,
    ...(accelerator ? { accelerator } : {}),
    click: () => send(command)
  })

  const appMenu: MenuItemConstructorOptions = {
    label: app.getName(),
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      item('Preferences…', 'settings', 'CmdOrCtrl+,'),
      { type: 'separator' },
      { role: 'services', submenu: [] },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' }
    ]
  }

  const fileMenu: MenuItemConstructorOptions = {
    label: mnemonic('&File'),
    submenu: [
      item('New Session', 'new_session', 'CmdOrCtrl+N'),
      item('Open Project…', 'open_project', 'CmdOrCtrl+O'),
      { type: 'separator' },
      item('Export Session to HTML', 'export_html'),
      ...(isMac
        ? ([{ type: 'separator' }, { role: 'close' }] satisfies MenuItemConstructorOptions[])
        : ([
            { type: 'separator' },
            item('Settings', 'settings', 'CmdOrCtrl+,'),
            { type: 'separator' },
            { role: 'quit' }
          ] satisfies MenuItemConstructorOptions[]))
    ]
  }

  const editMenu: MenuItemConstructorOptions = {
    label: mnemonic('&Edit'),
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      ...(isMac
        ? ([
            { role: 'pasteAndMatchStyle' },
            { role: 'delete' },
            { role: 'selectAll' },
            { type: 'separator' },
            { label: 'Speech', submenu: [{ role: 'startSpeaking' }, { role: 'stopSpeaking' }] }
          ] satisfies MenuItemConstructorOptions[])
        : ([{ role: 'delete' }, { type: 'separator' }, { role: 'selectAll' }] satisfies MenuItemConstructorOptions[])),
      { type: 'separator' },
      item('Find in Transcript', 'find_in_transcript', 'CmdOrCtrl+F')
    ]
  }

  const viewMenu: MenuItemConstructorOptions = {
    label: mnemonic('&View'),
    submenu: [
      item('Command Palette', 'command_palette', 'CmdOrCtrl+K'),
      item('Focus Composer', 'focus_composer', 'CmdOrCtrl+L'),
      item('Toggle Right Panel', 'toggle_right_panel', 'CmdOrCtrl+B'),
      { type: 'separator' },
      { role: 'reload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  }

  const windowMenu: MenuItemConstructorOptions = {
    label: mnemonic('&Window'),
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      { type: 'separator' },
      { role: 'front' },
      { type: 'separator' },
      { role: 'close' }
    ]
  }

  const helpMenu: MenuItemConstructorOptions = {
    role: 'help',
    label: mnemonic('&Help'),
    submenu: [
      { label: 'Oh My Pi Desktop Website', click: () => void shell.openExternal(HOMEPAGE) },
      // Without an app menu there is nowhere else for About to live.
      ...(isMac
        ? []
        : ([
            { type: 'separator' },
            { label: 'About Oh My Pi Desktop', click: () => app.showAboutPanel() }
          ] satisfies MenuItemConstructorOptions[]))
    ]
  }

  return isMac
    ? [appMenu, fileMenu, editMenu, viewMenu, windowMenu, helpMenu]
    : [fileMenu, editMenu, viewMenu, helpMenu]
}

/** Install the application menu. This is not cosmetic on macOS: without a menu
 *  the standard edit roles are unbound, so Cmd+C/V/A do nothing app-wide. */
export function installApplicationMenu(platform: string = process.platform): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate(platform)))
}
