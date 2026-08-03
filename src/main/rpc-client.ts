import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { EventEmitter } from 'events'
import readline from 'readline'
import type {
  AgentEvent,
  ReadyFrame,
  RpcChunkFrame,
  RpcOutbound,
  RpcResponse
} from './rpc-types'

export interface RpcClientOptions {
  ompPath: string
  cwd: string
  env?: Record<string, string>
  readyTimeoutMs?: number
  scriptMode?: boolean
}

export type RpcClientEvents = {
  event: [AgentEvent]
  ui_request: [Record<string, unknown>]
  exit: [{ code: number | null; signal: NodeJS.Signals | null }]
  error: [Error]
  parse_error: [{ line: string; error: Error }]
}

interface Pending {
  command: string
  resolve: (data: unknown) => void
  reject: (err: Error) => void
}

interface ChunkAccumulator {
  index: number
  count: number
  byteLength: number
  parts: string[]
}

export class RpcClient extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null
  private pending = new Map<string, Pending>()
  private seq = 0
  private writeChain: Promise<void> = Promise.resolve()
  private chunks = new Map<string, ChunkAccumulator>()
  private readyPromise: { resolve: () => void; reject: (e: Error) => void } | null = null
  private readyTimer: NodeJS.Timeout | null = null
  private v2 = false
  private readonly opts: RpcClientOptions

  constructor(opts: RpcClientOptions) {
    super()
    this.opts = { readyTimeoutMs: 15000, ...opts }
  }

  get pid(): number | undefined {
    return this.child?.pid
  }

  get connected(): boolean {
    return this.child !== null && !this.child.killed
  }

  start(): Promise<void> {
    if (this.child) throw new Error('RpcClient already started')
    const env = { PI_RPC_EMIT_TITLE: '1', ...process.env, ...this.opts.env }
    const bin = this.opts.scriptMode ? process.execPath : this.opts.ompPath
    const args = this.opts.scriptMode
      ? [this.opts.ompPath, '--mode', 'rpc', '--cwd', this.opts.cwd]
      : ['--mode', 'rpc', '--cwd', this.opts.cwd]
    // Windows npm/bun shims are .cmd batch files; child_process can only run
    // them through cmd.exe. windowsVerbatimArguments keeps our quoting intact —
    // Node would otherwise escape embedded quotes into \" which cmd.exe rejects.
    // With /s, cmd strips the outermost quotes and runs `"<bin>" --mode rpc --cwd "<cwd>"`.
    const shim = !this.opts.scriptMode && process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin)
    this.child = shim
      ? spawn('cmd.exe', ['/d', '/s', '/c', `""${bin}" --mode rpc --cwd "${this.opts.cwd}""`], {
          cwd: this.opts.cwd,
          env,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
          windowsVerbatimArguments: true
        })
      : spawn(bin, args, {
          cwd: this.opts.cwd,
          env,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true
        })

    this.child.on('error', (err) => {
      // Spawn failure (binary missing, bad path): fail fast instead of waiting
      // out the ready timeout, and never leave the child 'error' unhandled —
      // an unhandled 'error' event crashes the Electron main process.
      this.child = null
      if (this.readyTimer) {
        clearTimeout(this.readyTimer)
        this.readyTimer = null
      }
      this.readyPromise?.reject(new Error(`Failed to start omp: ${err.message}`))
      this.readyPromise = null
      this.emit('error', err)
    })

    this.child.stderr.on('data', (d: Buffer) => {
      const text = d.toString().trim()
      if (text) this.emit('error', new Error(`omp stderr: ${text}`))
    })

    this.child.on('exit', (code, signal) => {
      const err = new Error(`omp exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`)
      for (const p of this.pending.values()) p.reject(err)
      this.pending.clear()
      this.chunks.clear()
      this.readyTimer && clearTimeout(this.readyTimer)
      this.emit('exit', { code, signal })
    })

    const rl = readline.createInterface({ input: this.child.stdout, crlfDelay: Infinity })
    rl.on('line', (line) => {
      let obj: unknown
      try {
        obj = JSON.parse(line)
      } catch (e) {
        this.emit('parse_error', { line, error: e as Error })
        return
      }
      this.dispatch(obj as Record<string, unknown>)
    })

    return new Promise<void>((resolve, reject) => {
      this.readyPromise = { resolve, reject }
      this.readyTimer = setTimeout(() => {
        reject(new Error('Timed out waiting for omp ready frame'))
        this.stop()
      }, this.opts.readyTimeoutMs)
    })
  }

  private dispatch(obj: Record<string, unknown>): void {
    switch (obj.type) {
      case 'ready': {
        const ready = obj as unknown as ReadyFrame
        if (ready.supportedProtocolVersions?.includes(2)) {
          this.sendRaw({ type: 'negotiate_protocol', protocolVersion: 2 })
        } else {
          this.finishReady()
        }
        break
      }
      case 'rpc_chunk': {
        const acc = this.pushChunk(obj as unknown as RpcChunkFrame)
        if (acc === null) break
        try {
          const json = Buffer.from(acc.parts.join(''), 'base64').toString('utf8')
          this.dispatch(JSON.parse(json) as Record<string, unknown>)
        } catch (e) {
          this.emit('parse_error', { line: '<chunked>', error: e as Error })
        }
        break
      }
      case 'response': {
        const res = obj as unknown as RpcResponse
        if (res.command === 'negotiate_protocol') {
          // A failed negotiation falls back to v1 — the server still works, and
          // rpc_chunk frames are reassembled whenever they arrive regardless.
          if (res.success) {
            this.v2 = true
          } else {
            this.v2 = false
            this.emit('error', new Error(`v2 negotiation rejected: ${res.error ?? 'unknown'}`))
          }
          this.finishReady()
          break
        }
        const id = res.id
        if (id === undefined) {
          this.emit('parse_error', { line: JSON.stringify(obj), error: new Error(`response without id: ${res.command}`) })
          break
        }
        const p = this.pending.get(id)
        if (!p) {
          this.emit('parse_error', { line: JSON.stringify(obj), error: new Error(`unexpected response id ${id}`) })
          break
        }
        this.pending.delete(id)
        if (res.success) p.resolve(res.data)
        else p.reject(new Error(`${p.command} failed: ${res.error ?? 'unknown'}${res.code ? ` (${res.code})` : ''}`))
        break
      }
      case 'extension_ui_request':
        this.emit('ui_request', obj as Record<string, unknown>)
        break
      default:
        this.emit('event', obj as AgentEvent)
    }
  }

  private pushChunk(frame: RpcChunkFrame): ChunkAccumulator | null {
    let acc = this.chunks.get(frame.chunkId)
    if (!acc) {
      acc = { index: -1, count: frame.count, byteLength: frame.byteLength, parts: [] }
      this.chunks.set(frame.chunkId, acc)
    }
    if (frame.index !== acc.index + 1 || frame.count !== acc.count || frame.byteLength !== acc.byteLength) {
      this.chunks.delete(frame.chunkId)
      this.emit('parse_error', { line: JSON.stringify(frame), error: new Error('interleaved or invalid chunk sequence') })
      return null
    }
    acc.index = frame.index
    acc.parts.push(frame.data)
    if (acc.index + 1 < acc.count) return null
    this.chunks.delete(frame.chunkId)
    return acc
  }

  private finishReady(): void {
    if (this.readyTimer) {
      clearTimeout(this.readyTimer)
      this.readyTimer = null
    }
    this.readyPromise?.resolve()
    this.readyPromise = null
  }

  send(cmd: RpcOutbound): Promise<unknown> {
    if (!this.child) return Promise.reject(new Error('RpcClient not started'))
    const id = `req_${++this.seq}`
    const payload = { id, ...cmd } as Record<string, unknown>
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { command: cmd.type, resolve, reject })
      this.writeRaw(payload)
    })
  }

  sendRaw(frame: object): void {
    this.writeRaw(frame as Record<string, unknown>)
  }

  private writeRaw(frame: Record<string, unknown>): void {
    if (!this.child) throw new Error('RpcClient not started')
    const line = JSON.stringify(frame) + '\n'
    this.writeChain = this.writeChain.then(() => {
      return new Promise<void>((resolve, reject) => {
        const s = this.child!.stdin
        const ok = s.write(line, (err) => (err ? reject(err) : resolve()))
        if (!ok) {
          s.once('drain', resolve)
        }
      })
    })
    this.writeChain.catch(() => {
      /* write errors surface through pending rejects on exit */
    })
  }

  stop(): void {
    if (!this.child) return
    const child = this.child
    this.child = null
    const err = new Error('RpcClient stopped')
    for (const p of this.pending.values()) p.reject(err)
    this.pending.clear()
    child.stdin.end()
    const killer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        // already exited (Windows kill() throws EPERM)
      }
    }, 5000)
    child.once('exit', () => clearTimeout(killer))
    try {
      child.kill()
    } catch {
      // Windows: kill() on an already-exited child throws EPERM.
      // Reconnect/disconnect can stop() a client whose process already died.
    }
  }
}
