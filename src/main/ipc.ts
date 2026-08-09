import { app, dialog, ipcMain, BrowserWindow, Notification } from 'electron'
import { join } from 'path'
import { AgentHost } from './agent-host'
import { scanSessions } from './session-scanner'
import { readProjectFile } from './read-file'
import type { ProjectMemory } from './session-store'
import type { AppSettings, SettingsStore } from './settings-store'

/** Electron stringifies whatever a handler throws into the renderer's rejection
 *  message, so a plain `new Error(msg)` reaches a toast as "…: Error: msg" — a
 *  second prefix on top of the toast's own. A blank `name` makes
 *  Error.prototype.toString() return the bare message. */
class IpcError extends Error {
  name = ''
}

/** The renderer only ever shows `.message` in a toast, so no handler should
 *  reject with plumbing vocabulary. Strips rpc-client's own "<command> failed:"
 *  prefix (the renderer adds "Prompt failed: " itself) and translates the
 *  internal client states into the one thing a user can act on. */
export function friendlyMessage(err: unknown): string {
  const raw = (err instanceof Error ? err.message : String(err ?? '')).trim()
  if (!raw) return 'the agent failed for an unknown reason'
  const msg = raw.replace(/^[a-z_]+ failed: /i, '')
  if (/^rpcclient (not started|stopped)$/i.test(msg)) return 'Agent not connected'
  return msg
}

export function registerIpc(
  host: AgentHost,
  memory: ProjectMemory,
  /** Detection runs behind first paint (index.ts), so the path is a promise —
   *  `omp:omp_path` still answers with the resolved value once it is known. */
  ompPath: Promise<string>,
  installUpdate: () => void,
  settings: SettingsStore
): void {
  const send = (channel: string, payload: unknown): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(channel, payload)
    }
  }

  /** ipcMain.handle passes a raw throw straight through to the renderer, which
   *  is how "Agent not connected" reached the user as "Prompt failed: Error
   *  invoking remote method 'omp:prompt': Error: Agent not connected". Every
   *  agent-facing handler is registered through here so what it rejects with is
   *  a sentence. (The "Error invoking remote method" wrapper is added by
   *  ipcRenderer.invoke itself — only the renderer side can strip that.) */
  const handleAgent = <A extends unknown[], R>(
    channel: string,
    fn: (event: Electron.IpcMainInvokeEvent, ...args: A) => R | Promise<R>
  ): void => {
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        return await fn(event, ...(args as A))
      } catch (err) {
        throw new IpcError(friendlyMessage(err))
      }
    })
  }

  host.onEvent((frame) => {
    send('omp:event', frame)
    if (
      frame.type === 'agent_end' &&
      settings.get().notifyOnTurnEnd &&
      !BrowserWindow.getFocusedWindow() &&
      Notification.isSupported()
    ) {
      // The user is looking at another app — surface turn completion natively.
      new Notification({ title: 'Oh My Pi', body: 'The agent finished its turn.' }).show()
    }
  })
  host.onUiRequest((req) => send('omp:ui_request', req))
  host.onStatus((status) => send('omp:status', status))

  ipcMain.handle('omp:connect', async (_e, project: string) => {
    try {
      // The default workspace is created here, at the moment something actually
      // connects to it — asking what the default *is* must not litter a home
      // directory of a machine that never used it.
      if (project === memory.defaultProjectDir() && !memory.ensureDefaultProjectDir()) {
        return { ok: false as const, error: `could not create the default workspace at ${project}` }
      }
      await host.connect(project)
      return { ok: true as const }
    } catch (err) {
      return { ok: false as const, error: friendlyMessage(err) }
    }
  })

  ipcMain.handle('omp:disconnect', () => host.disconnect())
  ipcMain.handle('omp:status', () => ({ status: host.status, project: host.project, pid: host.client?.pid ?? null }))
  ipcMain.handle('omp:pick_project', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Choose a project directory for Oh My Pi',
      properties: ['openDirectory', 'createDirectory']
    })
    return res.canceled ? null : res.filePaths[0] ?? null
  })
  ipcMain.handle('omp:recall_project', () => memory.recall())
  ipcMain.handle('omp:default_project', () => memory.defaultProjectDir())
  ipcMain.handle('omp:read_file', (_e, filePath: string) => {
    const root = host.project
    if (!root) return { ok: false as const, error: 'no project connected' }
    return readProjectFile(root, filePath)
  })
  ipcMain.handle('omp:remember_project', (_e, cwd: string) => {
    // Defensive: recall() already ignores corrupt files, so a bad write here is
    // worse than no write at all — only persist well-formed paths.
    if (typeof cwd === 'string' && cwd.length > 0) memory.remember(cwd)
  })
  ipcMain.handle('omp:omp_path', () => ompPath)
  ipcMain.handle('omp:list_sessions', (_e, cwd: string) => scanSessions(defaultSessionDir(), cwd))

  handleAgent('omp:prompt', (_e, text: string) => host.prompt(text))
  handleAgent('omp:steer', (_e, text: string) => host.steer(text))
  handleAgent('omp:follow_up', (_e, text: string) => host.followUp(text))
  handleAgent('omp:abort', () => host.abort())
  handleAgent('omp:new_session', (_e, parent?: string) => host.newSession(parent))
  handleAgent('omp:switch_session', (_e, p: string) => host.switchSession(p))
  handleAgent('omp:rename_session', (_e, name: string) => host.renameSession(name))
  handleAgent('omp:export_html', () => host.exportHtml())
  handleAgent('omp:get_state', () => host.getState())
  handleAgent('omp:get_models', () => host.getModels())
  handleAgent('omp:set_model', (_e, provider: string, modelId: string) => host.setModel(provider, modelId))
  handleAgent('omp:set_thinking_level', (_e, level: string) => host.setThinkingLevel(level))
  handleAgent('omp:set_fast_mode', (_e, enabled: boolean) => host.setFastMode(enabled))
  handleAgent('omp:get_messages_page', (_e, cursor?: string, limit?: number) => host.getMessagesPage(cursor, limit))
  handleAgent('omp:ui_response', (_e, id: string, value: unknown, confirmed?: boolean, cancelled?: boolean) => {
    host.client?.sendRaw({ type: 'extension_ui_response', id, value, confirmed, cancelled })
  })
  ipcMain.handle('omp:update_install', () => installUpdate())

  ipcMain.handle('omp:get_settings', () => settings.get())
  ipcMain.handle('omp:update_settings', (_e, patch: Partial<AppSettings>) => {
    const next = settings.update(patch && typeof patch === 'object' ? patch : {})
    // Every window shares one settings file — broadcast so a second window's UI
    // can't drift from what was just persisted.
    send('omp:settings_changed', next)
    return next
  })
  ipcMain.handle('omp:reset_settings', () => {
    const next = settings.reset()
    send('omp:settings_changed', next)
    return next
  })
}

/** Where the agent keeps its session logs. Must be joined, not concatenated —
 *  hardcoded backslashes produce one nonsense filename on macOS and Linux,
 *  which silently reads back as "this project has no sessions". */
export function defaultSessionDir(): string {
  return join(app.getPath('home'), '.omp', 'agent', 'sessions')
}
