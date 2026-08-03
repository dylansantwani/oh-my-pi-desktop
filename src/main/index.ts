import { app, BrowserWindow, screen, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { AgentHost } from './agent-host'
import { registerIpc } from './ipc'
import { ProjectMemory } from './session-store'
import { findOmp } from './omp-detect'
import { setupUpdater, installUpdate, type UpdateStatus } from './updater'

const isDev = !app.isPackaged

interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  maximized: boolean
}

const DEFAULT_SIZE = { width: 1280, height: 800 }

function windowStateFile(): string {
  return join(app.getPath('userData'), 'window-state.json')
}

/** Restore the last window bounds when they still intersect a display; on the
 *  very first run open maximized so the app never greets the user small. */
function loadWindowState(): { bounds: Electron.Rectangle; maximized: boolean } {
  let saved: WindowState | null = null
  try {
    const raw = readFileSync(windowStateFile(), 'utf8')
    const parsed = JSON.parse(raw) as WindowState
    if (typeof parsed.width === 'number' && typeof parsed.height === 'number') saved = parsed
  } catch {
    /* first run or corrupt file — fall through to defaults */
  }
  if (!saved) {
    return { bounds: { ...DEFAULT_SIZE, x: 0, y: 0 }, maximized: true }
  }
  const bounds = { x: saved.x ?? 0, y: saved.y ?? 0, width: saved.width, height: saved.height }
  // A monitor that no longer exists (displays changed since last run) would
  // open the window off-screen — detect that and fall back to centered default.
  const visible = screen.getAllDisplays().some((d) => {
    const wa = d.workArea
    return bounds.x < wa.x + wa.width && bounds.x + bounds.width > wa.x && bounds.y < wa.y + wa.height && bounds.y + bounds.height > wa.y
  })
  if (!visible) return { bounds: { ...DEFAULT_SIZE, x: 0, y: 0 }, maximized: saved.maximized }
  return { bounds, maximized: saved.maximized }
}

function createWindow(): void {
  const { bounds, maximized } = loadWindowState()
  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 960,
    minHeight: 600,
    title: 'Oh My Pi Desktop',
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (maximized) win.maximize()

  let persistTimer: NodeJS.Timeout | null = null
  const saveNow = (): void => {
    if (win.isDestroyed()) return
    const b = win.getNormalBounds()
    const state: WindowState = { width: b.width, height: b.height, x: b.x, y: b.y, maximized: win.isMaximized() }
    try {
      writeFileSync(windowStateFile(), JSON.stringify(state), 'utf8')
    } catch {
      /* state persistence is best-effort */
    }
  }
  const persist = (): void => {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(saveNow, 300)
  }
  win.on('resize', persist)
  win.on('move', persist)
  win.on('close', saveNow)

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
  app.whenReady().then(() => {
    const memory = new ProjectMemory(app.getPath('userData'))
    const ompPath = findOmp() ?? 'omp'
    const host = new AgentHost({ ompPath, onLog: (msg) => console.log('[omp]', msg) })
    registerIpc(host, memory, ompPath, installUpdate)
    setupUpdater((status: UpdateStatus) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('omp:update_status', status)
      }
    })
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  app.on('window-all-closed', () => app.quit())
}
