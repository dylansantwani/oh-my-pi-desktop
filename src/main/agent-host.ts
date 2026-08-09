import { RpcClient } from './rpc-client'
import type { AgentEvent, RpcOutbound } from './rpc-types'

export type ConnectionStatus = 'starting' | 'connected' | 'reconnecting' | 'offline'

/** Reconnect backoff. A crash-looping omp used to be respawned every 500ms
 *  forever; doubling up to a 30s ceiling and giving up after six tries spends
 *  ~31s trying to recover and then says so instead of hammering the machine.
 *  `stableMs` is what separates "it crashed again" from "it ran fine for a
 *  while and then exited" — only the latter starts the count over. */
export interface ReconnectPolicy {
  baseMs: number
  maxMs: number
  maxAttempts: number
  stableMs: number
}

export const DEFAULT_RECONNECT: ReconnectPolicy = {
  baseMs: 500,
  maxMs: 30_000,
  maxAttempts: 6,
  stableMs: 60_000
}

/** Delay before reconnect attempt `attempt` (1-based). Exported so the schedule
 *  is testable without waiting out a real crash loop. */
export function reconnectDelay(attempt: number, policy: ReconnectPolicy = DEFAULT_RECONNECT): number {
  return Math.min(policy.maxMs, policy.baseMs * 2 ** Math.max(0, attempt - 1))
}

/** Control-plane RPCs (state, models, session switches) answer in milliseconds
 *  when omp is healthy, so a minute is far past "slow" and short enough that a
 *  wedged agent can't strand the UI. */
export const REQUEST_TIMEOUT_MS = 60_000

/** Prompts are different: the response to prompt/steer/follow_up can trail the
 *  turn it started, and real turns legitimately run for minutes. Ten minutes is
 *  long enough never to interrupt real work, finite so the message bubble can't
 *  sit there forever when omp stops responding. */
export const TURN_TIMEOUT_MS = 10 * 60_000

export interface AgentHostOptions {
  /** Resolved binary path, or a resolver awaited at spawn time — detection runs
   *  off the startup path (see index.ts) so it can still be in flight when the
   *  renderer auto-connects. */
  ompPath: string | (() => string | Promise<string>)
  /** test hook: spawn ompPath as a plain Node script (mock-omp.mjs) instead of a binary */
  spawnAsNode?: boolean
  onLog?: (msg: string) => void
  /** test hook: shrink the backoff so the give-up path is reachable in ms */
  reconnect?: Partial<ReconnectPolicy>
  /** test hooks: shrink the RPC deadlines */
  requestTimeoutMs?: number
  turnTimeoutMs?: number
}

export class AgentHost {
  private opts: AgentHostOptions
  private policy: ReconnectPolicy
  private _client: RpcClient | null = null
  private _project: string | null = null
  private _status: ConnectionStatus = 'offline'
  private reconnectTimer: NodeJS.Timeout | null = null
  private reconnectAttempts = 0
  private connectedAt = 0
  private disposed = false
  private listeners = new Set<(frame: Record<string, unknown>) => void>()
  private uiListeners = new Set<(req: Record<string, unknown>) => void>()
  private statusListeners = new Set<(s: ConnectionStatus) => void>()
  private connecting: Promise<void> | null = null
  private connectingProject: string | null = null
  private cancelConnect: ((err: Error) => void) | null = null
  /** Bumped by every connect. A spawn whose generation is stale has been
   *  superseded and must not touch status, the client, or the project. */
  private generation = 0

  constructor(opts: AgentHostOptions) {
    this.opts = opts
    this.policy = { ...DEFAULT_RECONNECT, ...opts.reconnect }
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
    if (this._status === 'connected' && this._project === project) return
    // React StrictMode double-mounts effects in dev, and the onboarding retry
    // can race the auto-connect — dedupe so a second connect doesn't dispose a
    // live client mid-handshake. Only for the *same* directory, though:
    // coalescing connect(B) into an in-flight connect(A) resolved "ok" while
    // the agent kept running in A, so the renderer displayed and remembered a
    // project the process was never in.
    if (this.connecting && this.connectingProject === project) return this.connecting

    const gen = ++this.generation
    const supersedePrevious = this.cancelConnect
    // A superseded attempt can never settle on its own: its client is stopped
    // mid-handshake and RpcClient.start() then neither resolves nor rejects, so
    // hand its caller an explicit rejection rather than a permanent hang.
    let cancel!: (err: Error) => void
    const cancelled = new Promise<never>((_resolve, reject) => {
      cancel = reject
    })
    this.cancelConnect = cancel
    this.connectingProject = project
    supersedePrevious?.(new Error(`connecting to ${this._project} was superseded by ${project}`))

    const attempt = Promise.race([this.doConnect(project, gen), cancelled]).finally(() => {
      // Only the newest attempt owns these slots — a superseded one settling
      // later must not clear the live attempt's bookkeeping.
      if (this.generation === gen) {
        this.connecting = null
        this.connectingProject = null
        this.cancelConnect = null
      }
    })
    this.connecting = attempt
    return attempt
  }

  private async doConnect(project: string, gen: number): Promise<void> {
    console.log('[host] connect', project)
    this._project = project
    this.reconnectAttempts = 0
    this.setStatus('starting')
    await this.spawn(gen)
  }

  private async spawn(gen: number = this.generation): Promise<void> {
    if (this.disposed || gen !== this.generation) return
    this.disposeClient()
    const project = this._project
    if (!project) return
    const ompPath = typeof this.opts.ompPath === 'function' ? await this.opts.ompPath() : this.opts.ompPath
    // Path detection can take seconds, so a connect issued while it ran may
    // already be superseded by the time it answers.
    if (this.disposed || gen !== this.generation) return
    const client = new RpcClient({
      ompPath,
      scriptMode: this.opts.spawnAsNode ?? false,
      cwd: project,
      env: { PI_RPC_EMIT_TITLE: '1' }
    })
    this._client = client
    client.on('event', (ev: AgentEvent) => this.emitEvent(ev as unknown as Record<string, unknown>))
    client.on('ui_request', (req) => {
      for (const l of this.uiListeners) l(req)
    })
    client.on('error', (e) => this.log(`omp: ${e.message}`))
    client.on('exit', () => this.handleExit())
    try {
      await client.start()
      if (gen !== this.generation) return
      console.log('[host] connected via', ompPath)
      this.connectedAt = Date.now()
      this.setStatus('connected')
    } catch (e) {
      if (gen !== this.generation) return
      console.log('[host] spawn failed:', (e as Error).message)
      this.setStatus('offline')
      throw e
    }
  }

  private handleExit(): void {
    if (this.disposed) return
    // A session that stayed up for a while is not a crash loop — reset the count
    // so an agent that dies after an hour still gets the full retry budget.
    if (this.connectedAt && Date.now() - this.connectedAt >= this.policy.stableMs) this.reconnectAttempts = 0
    this.connectedAt = 0
    if (this.reconnectAttempts >= this.policy.maxAttempts) {
      console.log('[host] agent keeps exiting; giving up')
      this.setStatus('offline')
      this.log(`omp keeps exiting — gave up after ${this.policy.maxAttempts} reconnect attempts`)
      return
    }
    const attempt = ++this.reconnectAttempts
    const delay = reconnectDelay(attempt, this.policy)
    console.log(`[host] agent exited; reconnect attempt ${attempt} in ${delay}ms`)
    this.setStatus('reconnecting')
    const gen = this.generation
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.spawn(gen).catch((e) => {
        this.log(`reconnect failed: ${(e as Error).message}`)
        // A ready-timeout stops the client, which comes back as another exit and
        // schedules the next attempt — don't contradict a retry already queued.
        if (!this.reconnectTimer) this.setStatus('offline')
      })
    }, delay)
  }

  private disposeClient(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this._client) {
      const c = this._client
      this._client = null
      // RpcClient re-emits 'error' from its child-process handlers during
      // teardown (a last stderr line, a kill that races the exit). An
      // EventEmitter with no 'error' listener *throws*, and nothing in the main
      // process catches that — so swap our handlers for a sink first, and leave
      // the sink attached: stderr can still arrive after stop() returns.
      c.removeAllListeners('event')
      c.removeAllListeners('ui_request')
      c.removeAllListeners('exit')
      c.removeAllListeners('parse_error')
      c.removeAllListeners('error')
      c.on('error', () => {
        /* teardown noise: the client is already on its way out */
      })
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

  private log(msg: string): void {
    this.opts.onLog?.(msg)
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

  /** Every RPC goes out with a deadline. RpcClient only rejects pending requests
   *  when the process exits, so a hung-but-alive omp otherwise left the caller —
   *  and the user's message bubble — waiting forever with no error. */
  private request(cmd: RpcOutbound, timeoutMs: number = this.opts.requestTimeoutMs ?? REQUEST_TIMEOUT_MS): Promise<unknown> {
    const sent = this.requireClient().send(cmd)
    let timer: NodeJS.Timeout | undefined
    return Promise.race([
      sent,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`the agent did not respond to ${cmd.type} within ${Math.round(timeoutMs / 1000)}s`)),
          timeoutMs
        )
      })
    ]).finally(() => {
      if (timer) clearTimeout(timer)
    })
  }

  private turnRequest(cmd: RpcOutbound): Promise<unknown> {
    return this.request(cmd, this.opts.turnTimeoutMs ?? TURN_TIMEOUT_MS)
  }

  prompt(text: string, streamingBehavior?: 'steer' | 'followUp'): Promise<unknown> {
    return this.turnRequest({ type: 'prompt', message: text, streamingBehavior })
  }

  steer(text: string): Promise<unknown> {
    return this.turnRequest({ type: 'steer', message: text })
  }

  followUp(text: string): Promise<unknown> {
    return this.turnRequest({ type: 'follow_up', message: text })
  }

  abort(): Promise<unknown> {
    return this.request({ type: 'abort' })
  }

  newSession(parentSession?: string): Promise<unknown> {
    return this.request({ type: 'new_session', parentSession })
  }

  switchSession(path: string): Promise<unknown> {
    return this.request({ type: 'switch_session', sessionPath: path })
  }

  renameSession(name: string): Promise<unknown> {
    return this.request({ type: 'set_session_name', name })
  }

  exportHtml(outputPath?: string): Promise<unknown> {
    return this.request({ type: 'export_html', outputPath })
  }

  getState(): Promise<unknown> {
    return this.request({ type: 'get_state' })
  }

  getModels(): Promise<unknown> {
    return this.request({ type: 'get_available_models' })
  }

  setModel(provider: string, modelId: string): Promise<unknown> {
    return this.request({ type: 'set_model', provider, modelId })
  }

  setThinkingLevel(level: string): Promise<unknown> {
    return this.request({ type: 'set_thinking_level', level })
  }

  setFastMode(enabled: boolean): Promise<unknown> {
    return this.request({ type: 'set_fast_mode', enabled })
  }

  getMessagesPage(cursor?: string, limit?: number): Promise<unknown> {
    return this.request({ type: 'get_messages_page', cursor, limit })
  }
}
