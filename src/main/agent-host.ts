import { RpcClient } from './rpc-client'
import type { AgentEvent } from './rpc-types'

export type ConnectionStatus = 'starting' | 'connected' | 'reconnecting' | 'offline'

export interface AgentHostOptions {
  ompPath: string
  /** test hook: spawn ompPath as a plain Node script (mock-omp.mjs) instead of a binary */
  spawnAsNode?: boolean
  onLog?: (msg: string) => void
}

export class AgentHost {
  private opts: AgentHostOptions
  private _client: RpcClient | null = null
  private _project: string | null = null
  private _status: ConnectionStatus = 'offline'
  private reconnectTimer: NodeJS.Timeout | null = null
  private disposed = false
  private listeners = new Set<(frame: Record<string, unknown>) => void>()
  private uiListeners = new Set<(req: Record<string, unknown>) => void>()
  private statusListeners = new Set<(s: ConnectionStatus) => void>()

  constructor(opts: AgentHostOptions) {
    this.opts = opts
  }

  get status(): ConnectionStatus {
    return this._status
  }

  get project(): string | null {
    return this._project
  }

  get client(): RpcClient | null {
    return this._client
  }

  async connect(project: string): Promise<void> {
    this._project = project
    this.setStatus('starting')
    await this.spawn()
  }

  private async spawn(): Promise<void> {
    if (this.disposed) return
    this.disposeClient()
    const project = this._project
    if (!project) return
    const client = new RpcClient({
      ompPath: this.opts.ompPath,
      scriptMode: this.opts.spawnAsNode ?? false,
      cwd: project,
      env: { PI_RPC_EMIT_TITLE: '1' }
    })
    this._client = client
    client.on('event', (ev: AgentEvent) => this.emitEvent(ev as unknown as Record<string, unknown>))
    client.on('ui_request', (req) => {
      for (const l of this.uiListeners) l(req)
    })
    client.on('error', (e) => this.opts.onLog?.(`omp: ${e.message}`))
    client.on('exit', () => this.handleExit())
    try {
      await client.start()
      this.setStatus('connected')
    } catch (e) {
      this.setStatus('offline')
      throw e
    }
  }

  private handleExit(): void {
    if (this.disposed) return
    this.setStatus('reconnecting')
    this.reconnectTimer = setTimeout(() => {
      void this.spawn().catch((e) => {
        this.opts.onLog?.(`reconnect failed: ${(e as Error).message}`)
        this.setStatus('offline')
      })
    }, 500)
  }

  private disposeClient(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this._client) {
      const c = this._client
      this._client = null
      c.removeAllListeners()
      c.stop()
    }
  }

  disconnect(): void {
    this.disposed = true
    this.disposeClient()
    this.setStatus('offline')
  }

  private setStatus(s: ConnectionStatus): void {
    if (this._status === s) return
    this._status = s
    for (const l of this.statusListeners) l(s)
  }

  private emitEvent(frame: Record<string, unknown>): void {
    for (const l of this.listeners) l(frame)
  }

  onEvent(cb: (frame: Record<string, unknown>) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  onUiRequest(cb: (req: Record<string, unknown>) => void): () => void {
    this.uiListeners.add(cb)
    return () => this.uiListeners.delete(cb)
  }

  onStatus(cb: (s: ConnectionStatus) => void): () => void {
    this.statusListeners.add(cb)
    return () => this.statusListeners.delete(cb)
  }

  private requireClient(): RpcClient {
    if (!this._client || this._status !== 'connected') throw new Error('Agent not connected')
    return this._client
  }

  prompt(text: string, streamingBehavior?: 'steer' | 'followUp'): Promise<unknown> {
    return this.requireClient().send({ type: 'prompt', message: text, streamingBehavior })
  }

  steer(text: string): Promise<unknown> {
    return this.requireClient().send({ type: 'steer', message: text })
  }

  followUp(text: string): Promise<unknown> {
    return this.requireClient().send({ type: 'follow_up', message: text })
  }

  abort(): Promise<unknown> {
    return this.requireClient().send({ type: 'abort' })
  }

  newSession(parentSession?: string): Promise<unknown> {
    return this.requireClient().send({ type: 'new_session', parentSession })
  }

  switchSession(path: string): Promise<unknown> {
    return this.requireClient().send({ type: 'switch_session', sessionPath: path })
  }

  renameSession(name: string): Promise<unknown> {
    return this.requireClient().send({ type: 'set_session_name', name })
  }

  exportHtml(outputPath?: string): Promise<unknown> {
    return this.requireClient().send({ type: 'export_html', outputPath })
  }

  getState(): Promise<unknown> {
    return this.requireClient().send({ type: 'get_state' })
  }

  getModels(): Promise<unknown> {
    return this.requireClient().send({ type: 'get_available_models' })
  }

  setModel(provider: string, modelId: string): Promise<unknown> {
    return this.requireClient().send({ type: 'set_model', provider, modelId })
  }

  setThinkingLevel(level: string): Promise<unknown> {
    return this.requireClient().send({ type: 'set_thinking_level', level })
  }

  setFastMode(enabled: boolean): Promise<unknown> {
    return this.requireClient().send({ type: 'set_fast_mode', enabled })
  }

  getMessagesPage(cursor?: string, limit?: number): Promise<unknown> {
    return this.requireClient().send({ type: 'get_messages_page', cursor, limit })
  }
}
