import { app, dialog, ipcMain, BrowserWindow } from 'electron'
import { AgentHost } from './agent-host'
import { scanSessions } from './session-scanner'
import type { ProjectMemory } from './session-store'

export function registerIpc(host: AgentHost, memory: ProjectMemory, ompPath: string): void {
  const send = (channel: string, payload: unknown): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(channel, payload)
    }
  }

  host.onEvent((frame) => send('omp:event', frame))
  host.onUiRequest((req) => send('omp:ui_request', req))
  host.onStatus((status) => send('omp:status', status))

  ipcMain.handle('omp:connect', async (_e, project: string) => {
    try {
      await host.connect(project)
      return { ok: true as const }
    } catch (err) {
      return { ok: false as const, error: (err as Error).message }
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
  ipcMain.handle('omp:remember_project', (_e, cwd: string) => {
    // Defensive: recall() already ignores corrupt files, so a bad write here is
    // worse than no write at all — only persist well-formed paths.
    if (typeof cwd === 'string' && cwd.length > 0) memory.remember(cwd)
  })
  ipcMain.handle('omp:omp_path', () => ompPath)
  ipcMain.handle('omp:list_sessions', (_e, cwd: string) => scanSessions(defaultSessionDir(), cwd))

  ipcMain.handle('omp:prompt', (_e, text: string) => host.prompt(text))
  ipcMain.handle('omp:steer', (_e, text: string) => host.steer(text))
  ipcMain.handle('omp:follow_up', (_e, text: string) => host.followUp(text))
  ipcMain.handle('omp:abort', () => host.abort())
  ipcMain.handle('omp:new_session', (_e, parent?: string) => host.newSession(parent))
  ipcMain.handle('omp:switch_session', (_e, p: string) => host.switchSession(p))
  ipcMain.handle('omp:rename_session', (_e, name: string) => host.renameSession(name))
  ipcMain.handle('omp:export_html', () => host.exportHtml())
  ipcMain.handle('omp:get_state', () => host.getState())
  ipcMain.handle('omp:get_models', () => host.getModels())
  ipcMain.handle('omp:set_model', (_e, provider: string, modelId: string) => host.setModel(provider, modelId))
  ipcMain.handle('omp:set_thinking_level', (_e, level: string) => host.setThinkingLevel(level))
  ipcMain.handle('omp:set_fast_mode', (_e, enabled: boolean) => host.setFastMode(enabled))
  ipcMain.handle('omp:get_messages_page', (_e, cursor?: string, limit?: number) => host.getMessagesPage(cursor, limit))
  ipcMain.handle('omp:ui_response', (_e, id: string, value: unknown, confirmed?: boolean, cancelled?: boolean) => {
    host.client?.sendRaw({ type: 'extension_ui_response', id, value, confirmed, cancelled })
  })
}

export function defaultSessionDir(): string {
  return app.getPath('home') + '\\' + '.omp\\agent\\sessions'
}
