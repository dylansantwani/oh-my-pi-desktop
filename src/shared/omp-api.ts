export type ReadFileResult = { ok: true; content: string; size: number } | { ok: false; error: string }

/** Channel the application menu uses to hand a command to the renderer. Shared
 *  so the main-process emitter and the preload subscriber cannot drift apart. */
export const MENU_COMMAND_CHANNEL = 'omp:menu_command'

/** Every command the application menu can emit. The menu only decides *when* a
 *  command fires — the renderer owns what each one actually does. */
export type MenuCommand =
  | 'new_session'
  | 'open_project'
  | 'command_palette'
  | 'focus_composer'
  | 'export_html'
  | 'toggle_right_panel'
  | 'find_in_transcript'
  | 'settings'

export interface OmpApi {
  /** `process.platform`, captured when the bridge is built. The renderer needs
   *  it to inset the top bar for the macOS traffic lights. */
  platform: string
  connect(project: string): Promise<{ ok: true } | { ok: false; error: string }>
  disconnect(): Promise<void>
  getStatus(): Promise<{ status: string; project: string | null; pid: number | null }>
  pickProject(): Promise<string | null>
  recallProject(): Promise<string | null>
  rememberProject(cwd: string): Promise<void>
  defaultProject(): Promise<string>
  readFile(path: string): Promise<ReadFileResult>
  getOmpPath(): Promise<string>
  prompt(text: string): Promise<unknown>
  steer(text: string): Promise<unknown>
  followUp(text: string): Promise<unknown>
  abort(): Promise<unknown>
  newSession(parentSession?: string): Promise<unknown>
  switchSession(path: string): Promise<unknown>
  renameSession(name: string): Promise<unknown>
  exportHtml(): Promise<unknown>
  getState(): Promise<unknown>
  getModels(): Promise<unknown>
  setModel(provider: string, modelId: string): Promise<unknown>
  setThinkingLevel(level: string): Promise<unknown>
  setFastMode(enabled: boolean): Promise<unknown>
  getMessagesPage(cursor?: string, limit?: number): Promise<unknown>
  listSessions(cwd: string): Promise<{ path: string; title: string; cwd: string; mtimeMs: number; sizeBytes: number }[]>
  uiResponse(id: string, value: unknown, confirmed?: boolean, cancelled?: boolean): Promise<void>
  onEvent(cb: (frame: Record<string, unknown>) => void): () => void
  onUiRequest(cb: (req: Record<string, unknown>) => void): () => void
  onStatus(cb: (status: string) => void): () => void
  /** Errors and stderr from the agent process. These used to go only to the
   *  main process console, so an `omp` that started but failed left the UI
   *  looking connected with no explanation anywhere. */
  onAgentError(cb: (payload: { message: string }) => void): () => void
  onUpdateStatus(cb: (status: UpdateStatus) => void): () => void
  onMenuCommand(cb: (command: MenuCommand) => void): () => void
  installUpdate(): Promise<void>
  getSettings(): Promise<AppSettings>
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>
  resetSettings(): Promise<AppSettings>
  onSettingsChanged(cb: (settings: AppSettings) => void): () => void
}

export type ThemeMode = 'system' | 'dark' | 'light'

export interface AppSettings {
  theme: ThemeMode
  fontSize: number
  notifyOnTurnEnd: boolean
  autoCheckUpdates: boolean
  ompPathOverride: string | null
}

export type UpdateStatus =
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }
