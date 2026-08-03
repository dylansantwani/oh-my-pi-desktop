export interface OmpApi {
  connect(project: string): Promise<{ ok: true } | { ok: false; error: string }>
  disconnect(): Promise<void>
  getStatus(): Promise<{ status: string; project: string | null; pid: number | null }>
  pickProject(): Promise<string | null>
  recallProject(): Promise<string | null>
  rememberProject(cwd: string): Promise<void>
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
  onUpdateStatus(cb: (status: UpdateStatus) => void): () => void
  installUpdate(): Promise<void>
}

export type UpdateStatus =
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }
