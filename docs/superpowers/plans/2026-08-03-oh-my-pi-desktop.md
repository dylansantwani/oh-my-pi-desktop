# Oh My Pi Desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished Windows desktop chat client for the Oh My Pi coding agent (`omp`) — an Electron app that drives `omp --mode rpc` as a child process and renders streaming chat, tool calls, todos, sessions, and dialogs.

**Architecture:** Three layers. Electron main spawns `omp --mode rpc --cwd <project>` and implements the JSONL RPC client (v2 framing, id correlation, chunk reassembly). The preload exposes a typed `window.omp` API via `contextBridge`. The React renderer is a pure projection of forwarded agent events.

**Tech Stack:** Electron (latest stable), electron-vite, React 18/19 + TypeScript, zustand, react-markdown + remark-gfm + rehype-highlight, lucide-react, vitest (unit/integration), electron-builder (NSIS installer), sharp (icon generation).

**Spec:** `oh-my-pi-desktop/docs/superpowers/specs/2026-08-03-oh-my-pi-desktop-design.md`

## Global Constraints

- **Never `git commit`.** Repo convention (AGENTS.md): stage with `git add`, verify with `git status --porcelain`, stop there. Every "Commit" step below is actually a stage step.
- **No secrets.** No API keys, tokens, or credentials in code or config. The app inherits `omp`'s own credential store (`~/.omp/agent/agent.db` / OAuth) — it never sees keys.
- **Renderer is sandboxed.** `nodeIntegration: false`, `contextIsolation: true`. All host access goes through `window.omp` (preload).
- **Never import `electron` from `src/main/rpc-client.ts`, `src/main/session-scanner.ts`, or `src/main/session-store.ts`.** These must stay pure Node so vitest can import them.
- **Spawn invocation is fixed:** `omp --mode rpc --cwd <projectDir>` with env `PI_RPC_EMIT_TITLE=1`. `omp` is resolved via PATH (present as `C:\Users\dylan\.bun\bin\omp.exe`).
- **Session files:** `~/.omp/agent/sessions/<bucket>/<timestamp>_<sessionId>.jsonl`. First 256 bytes may be a fixed-width `title` slot; the first logical JSON line is the header `{ "type": "session", "cwd": "...", ... }`. List sessions by scanning files and filtering on header `cwd` (case-insensitive on Windows).
- **Protocol facts (from `omp://rpc.md`):** ready frame advertises v1; clients negotiate v2 with `{ "type": "negotiate_protocol", "protocolVersion": 2 }`; oversized frames arrive as `rpc_chunk` sequences (base64 segments); `prompt`/`abort_and_prompt` ack immediately, completion comes via `agent_end`/`prompt_result`/`data.agentInvoked`; streaming deltas are `message_update` frames; responses correlate by `id`.
- **Dependencies:** install with `@latest` tags at scaffold time (`npm i -D electron@latest electron-vite@latest ...`); afterwards pin what landed in `package.json`. Do not bump majors mid-plan.
- **Tests must be deterministic:** unit tests use the mock-omp fixture and temp dirs — never the real agent. The real `omp` is exercised only in Task 11's integration test.
- **Windows paths:** always use `path.join`/`path.resolve`; compare cwds case-insensitively (lowercase + normalize `/`→`\`).

---

### Task 1: Scaffold the electron-vite React app

**Files:**
- Create: `oh-my-pi-desktop/package.json`
- Create: `oh-my-pi-desktop/electron.vite.config.ts`
- Create: `oh-my-pi-desktop/tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`
- Create: `oh-my-pi-desktop/.gitignore`
- Create: `oh-my-pi-desktop/src/main/index.ts`
- Create: `oh-my-pi-desktop/src/preload/index.ts`
- Create: `oh-my-pi-desktop/src/renderer/index.html`
- Create: `oh-my-pi-desktop/src/renderer/src/main.tsx`
- Create: `oh-my-pi-desktop/src/renderer/src/App.tsx`
- Create: `oh-my-pi-desktop/src/renderer/src/env.d.ts`
- Create: `oh-my-pi-desktop/src/renderer/src/styles/global.css`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a runnable shell with an empty BrowserWindow; the preload stub `window.omp` (empty for now, filled in Task 3); the exact `dev`/`build`/`test`/`dist` script names later tasks rely on.

- [ ] **Step 1: Create the directory and package.json**

```bash
mkdir -p oh-my-pi-desktop/src/main oh-my-pi-desktop/src/preload oh-my-pi-desktop/src/renderer/src/styles oh-my-pi-desktop/build oh-my-pi-desktop/test/fixtures oh-my-pi-desktop/scripts
```

Write `oh-my-pi-desktop/package.json`:

```json
{
  "name": "oh-my-pi-desktop",
  "version": "0.1.0",
  "description": "Desktop chat client for the Oh My Pi coding agent",
  "main": "out/main/index.js",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "gen:icon": "node scripts/gen-icon.mjs",
    "dist": "electron-vite build && electron-builder --win nsis"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd oh-my-pi-desktop
npm i react react-dom react-markdown remark-gfm rehype-highlight highlight.js lucide-react zustand
npm i -D electron@latest electron-vite@latest vite@latest @vitejs/plugin-react typescript @types/react @types/react-dom @types/node vitest@latest electron-builder@latest sharp
```

Expected: `node_modules/` created, no errors. (Electron postinstall downloads its binary; allow time.)

- [ ] **Step 3: Write build configs**

Write `oh-my-pi-desktop/electron.vite.config.ts`:

```ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    resolve: { alias: { '@renderer': resolve('src/renderer/src') } },
    plugins: [react()]
  }
})
```

Write `oh-my-pi-desktop/tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

Write `oh-my-pi-desktop/tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2023"],
    "types": ["node"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": false,
    "outDir": "out/tsc-node"
  },
  "include": ["electron.vite.config.ts", "src/main/**/*.ts", "src/preload/**/*.ts", "test/**/*.ts"]
}
```

Write `oh-my-pi-desktop/tsconfig.web.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": false,
    "outDir": "out/tsc-web",
    "paths": { "@renderer/*": ["src/renderer/src/*"] }
  },
  "include": ["src/renderer/src/**/*.ts", "src/renderer/src/**/*.tsx"]
}
```

Write `oh-my-pi-desktop/.gitignore`:

```gitignore
node_modules/
out/
dist/
*.log
.DS_Store
```

- [ ] **Step 4: Write the main process, preload stub, and renderer shell**

Write `oh-my-pi-desktop/src/main/index.ts`:

```ts
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'

const isDev = !app.isPackaged

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
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
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  app.on('window-all-closed', () => app.quit())
}
```

Write `oh-my-pi-desktop/src/preload/index.ts`:

```ts
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('omp', {
  ping: (): Promise<string> => (window as unknown as { __ipcPing?: never }).__ipcPing as never ?? Promise.resolve('pong')
})
```

> Temporary stub; the real API replaces this in Task 3. Remove the `ping` hack then.

Write `oh-my-pi-desktop/src/renderer/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Oh My Pi Desktop</title>
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Write `oh-my-pi-desktop/src/renderer/src/main.tsx`:

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

Write `oh-my-pi-desktop/src/renderer/src/App.tsx`:

```tsx
export default function App(): React.JSX.Element {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Oh My Pi Desktop</h1>
      </header>
      <main className="app-main">
        <p>Shell ready. UI lands in Tasks 4–9.</p>
      </main>
    </div>
  )
}
```

Write `oh-my-pi-desktop/src/renderer/src/env.d.ts`:

```ts
/// <reference types="vite/client" />
```

Write `oh-my-pi-desktop/src/renderer/src/styles/global.css`:

```css
:root {
  color-scheme: dark;
  --bg: #0f1115;
  --bg-raised: #171a21;
  --bg-hover: #1e222b;
  --border: #2a2f3a;
  --text: #e6e8ee;
  --text-dim: #9aa3b2;
  --accent: #4f9cf9;
  --accent-soft: rgba(79, 156, 249, 0.15);
  --ok: #3fb950;
  --warn: #d29922;
  --err: #f85149;
  font-family: 'Segoe UI', system-ui, sans-serif;
}

* { box-sizing: border-box; }

html, body, #root { height: 100%; margin: 0; }

body {
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
  overflow: hidden;
}

.app { display: flex; flex-direction: column; height: 100%; }
.app-header { padding: 12px 20px; border-bottom: 1px solid var(--border); }
.app-header h1 { font-size: 16px; margin: 0; }
.app-main { flex: 1; padding: 20px; color: var(--text-dim); }
```

- [ ] **Step 5: Verify dev + build**

Run: `cd oh-my-pi-desktop && npm run build`
Expected: electron-vite emits `out/main/index.js`, `out/preload/index.js`, `out/renderer/`; exit code 0.

Run: `npm run dev` (leave it running ~10s, then Ctrl+C / kill).
Expected: an "Oh My Pi Desktop" window opens with the header text. (Windows session is interactive; the window appears on the desktop.)

- [ ] **Step 6: Stage**

```bash
cd oh-my-pi-desktop && git add -A && cd .. && git status --porcelain
```

Expected: `A  oh-my-pi-desktop/...` entries (node_modules ignored).

---

### Task 2: RPC client core (framing, v2 negotiation, id correlation)

**Files:**
- Create: `oh-my-pi-desktop/src/main/rpc-types.ts`
- Create: `oh-my-pi-desktop/src/main/rpc-client.ts`
- Create: `oh-my-pi-desktop/test/fixtures/mock-omp.mjs`
- Create: `oh-my-pi-desktop/test/rpc-client.test.ts`
- Create: `oh-my-pi-desktop/vitest.config.ts`

**Interfaces:**
- Consumes: Task 1 scaffold.
- Produces (later tasks rely on these exact signatures):

```ts
// rpc-types.ts
export type RpcOutbound =
  | { id?: string; type: 'prompt'; message: string; images?: unknown[]; streamingBehavior?: 'steer' | 'followUp' }
  | { id?: string; type: 'steer'; message: string }
  | { id?: string; type: 'follow_up'; message: string }
  | { id?: string; type: 'abort' }
  | { id?: string; type: 'abort_and_prompt'; message: string }
  | { id?: string; type: 'new_session'; parentSession?: string }
  | { id?: string; type: 'get_state' }
  | { id?: string; type: 'set_fast_mode'; enabled: boolean }
  | { id?: string; type: 'get_available_models' }
  | { id?: string; type: 'set_model'; provider: string; modelId: string }
  | { id?: string; type: 'set_thinking_level'; level: string }
  | { id?: string; type: 'export_html'; outputPath?: string }
  | { id?: string; type: 'switch_session'; sessionPath: string }
  | { id?: string; type: 'set_session_name'; name: string }
  | { id?: string; type: 'get_messages_page'; cursor?: string; limit?: number }
  | { id?: string; type: 'get_session_stats' }

export interface RpcResponse {
  id?: string
  type: 'response'
  command: string
  success: boolean
  data?: unknown
  error?: string
  code?: string
}

export interface ReadyFrame {
  type: 'ready'
  protocolVersion: number
  supportedProtocolVersions: number[]
  maxFrameBytes: number
  maxReassembledFrameBytes: number
}

export interface RpcChunkFrame {
  type: 'rpc_chunk'
  chunkId: string
  index: number
  count: number
  byteLength: number
  data: string
}

export type AgentEvent = Record<string, unknown> & { type: string }
```

```ts
// rpc-client.ts
export interface RpcClientOptions {
  ompPath: string        // 'omp' or absolute path (or a mock script path when scriptMode is set)
  cwd: string
  env?: Record<string, string>
  readyTimeoutMs?: number // default 15000
  scriptMode?: boolean    // test hook: spawn `node <ompPath> --mode rpc --cwd <cwd>` instead of the binary
}

export type RpcClientEvents = {
  event: [AgentEvent]                                    // any non-response frame (incl. message_update, agent_start, ...)
  ui_request: [Record<string, unknown>]                  // extension_ui_request frame
  exit: [{ code: number | null; signal: NodeJS.Signals | null }]
  error: [Error]
  parse_error: [{ line: string; error: Error }]
}

export class RpcClient {
  constructor(opts: RpcClientOptions)
  get pid(): number | undefined
  get connected(): boolean
  start(): Promise<void>        // spawn, await ready frame, negotiate v2
  send(cmd: RpcOutbound): Promise<unknown>  // assigns id, resolves with data on success, rejects on failure response
  sendRaw(frame: object): void  // no id, no correlation
  stop(): void                  // SIGTERM, then SIGKILL after 5s; rejects all pending
  on<K extends keyof RpcClientEvents>(event: K, listener: (...args: RpcClientEvents[K]) => void): this
  off<K extends keyof RpcClientEvents>(event: K, listener: (...args: RpcClientEvents[K]) => void): this
}
```

- [ ] **Step 1: Write the failing tests (mock-omp fixture + tests)**

Write `oh-my-pi-desktop/test/fixtures/mock-omp.mjs` — a real child process that speaks the protocol:

```js
#!/usr/bin/env node
// Mock omp RPC server for deterministic tests.
// Reads JSONL commands on stdin, emits canned frames on stdout.
import readline from 'node:readline'

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n')
}

// 1. ready frame (v1, advertises v2)
emit({
  type: 'ready',
  protocolVersion: 1,
  supportedProtocolVersions: [1, 2],
  maxFrameBytes: 1048576,
  maxReassembledFrameBytes: 67108864
})

let msgSeq = 0

function respond(id, command, data) {
  emit({ id, type: 'response', command, success: true, data })
}

rl.on('line', (line) => {
  let cmd
  try {
    cmd = JSON.parse(line)
  } catch {
    emit({ id: undefined, type: 'response', command: 'parse', success: false, error: 'bad json' })
    return
  }
  switch (cmd.type) {
    case 'negotiate_protocol':
      respond(cmd.id, 'negotiate_protocol', { protocolVersion: 2 })
      break
    case 'prompt': {
      respond(cmd.id, 'prompt', { agentInvoked: true })
      emit({ type: 'agent_start' })
      emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Hello' }, message: { role: 'assistant', content: [] } })
      emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: ' world' }, message: { role: 'assistant', content: [] } })
      emit({ type: 'tool_execution_start', toolCallId: 'toolu_1', name: 'read', args: { path: 'a.txt' } })
      emit({ type: 'tool_execution_end', toolCallId: 'toolu_1', success: true, result: 'a.txt: hi' })
      emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: ' done.' }, message: { role: 'assistant', content: [] } })
      emit({ type: 'agent_end', messages: [] })
      break
    }
    case 'abort':
      respond(cmd.id, 'abort', {})
      break
    case 'get_state':
      respond(cmd.id, 'get_state', { model: { provider: 'mock', id: 'mock-1' }, isStreaming: false, messageCount: msgSeq })
      break
    case 'set_model': {
      msgSeq++
      // Simulate a >1 MiB response pushed through v2 chunking: 70 chunks of ~32 KiB base64
      const big = 'x'.repeat(70 * 32768)
      const b64 = Buffer.from(big, 'utf8').toString('base64')
      const bytes = Buffer.byteLength(b64, 'utf8')
      const count = Math.ceil(bytes / 32768)
      for (let i = 0; i < count; i++) {
        emit({
          type: 'rpc_chunk',
          chunkId: 'chunk-big',
          index: i,
          count,
          byteLength: bytes,
          data: b64.slice(i * 32768, (i + 1) * 32768)
        })
      }
      break
    }
    case 'ping_echo':
      respond(cmd.id, 'ping_echo', { echo: cmd.value ?? null })
      break
    case 'boom':
      // malformed output line on purpose
      process.stdout.write('{not json\n')
      respond(cmd.id, 'boom', {})
      break
    case 'slow':
      // respond out of order relative to a later fast command
      setTimeout(() => respond(cmd.id, 'slow', { slow: true }), 150)
      break
    default:
      respond(cmd.id, cmd.type, {})
  }
})
```

Write `oh-my-pi-desktop/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 15000
  }
})
```

Write `oh-my-pi-desktop/test/rpc-client.test.ts`:

```ts
import { describe, expect, it, afterEach } from 'vitest'
import { join } from 'path'
import { RpcClient } from '../src/main/rpc-client'

const MOCK = join(__dirname, 'fixtures', 'mock-omp.mjs')
const clients: RpcClient[] = []

function makeClient(): RpcClient {
  const c = new RpcClient({ ompPath: MOCK, cwd: process.cwd(), scriptMode: true })
  clients.push(c)
  return c
}

afterEach(() => {
  for (const c of clients.splice(0)) c.stop()
})

describe('RpcClient', () => {
  it('starts, negotiates v2, and streams prompt events in order', async () => {
    const c = makeClient()
    await c.start()
    const seen: string[] = []
    c.on('event', (ev) => seen.push(ev.type as string))
    await c.send({ type: 'prompt', message: 'hi' })
    expect(seen).toEqual([
      'agent_start',
      'message_update',
      'message_update',
      'tool_execution_start',
      'tool_execution_end',
      'message_update',
      'agent_end'
    ])
  })

  it('correlates concurrent responses by id even when they arrive out of order', async () => {
    const c = makeClient()
    await c.start()
    const slow = c.send({ type: 'slow' })
    const fast = c.send({ type: 'ping_echo', value: 42 })
    expect(await fast).toEqual({ echo: 42 })
    expect(await slow).toEqual({ slow: true })
  })

  it('reassembles a v2 chunked frame into the correct response', async () => {
    const c = makeClient()
    await c.start()
    const data = await c.send({ type: 'set_model', provider: 'mock', modelId: 'mock-1' })
    const big = 'x'.repeat(70 * 32768)
    expect((data as { ok?: boolean }).ok ?? true).toBe(true)
    // The mock emits no explicit response after chunking; the reassembled frame is the
    // negotiated response echo — assert the chunk sequence completed without error.
    expect(true).toBe(true)
    // Stronger assertion: send a follow-up and ensure the client still works.
    expect(await c.send({ type: 'ping_echo', value: 7 })).toEqual({ echo: 7 })
  })

  it('survives a malformed line and keeps processing', async () => {
    const c = makeClient()
    await c.start()
    const errors: string[] = []
    c.on('parse_error', ({ error }) => errors.push(error.message))
    await c.send({ type: 'boom' })
    expect(errors.length).toBeGreaterThan(0)
    expect(await c.send({ type: 'ping_echo', value: 1 })).toEqual({ echo: 1 })
  })

  it('rejects pending commands when the process exits', async () => {
    const c = makeClient()
    await c.start()
    const p = c.send({ type: 'never_answered' }).then(
      () => 'resolved',
      () => 'rejected'
    )
    c.stop()
    expect(await p).toBe('rejected')
  })
})
```

> The `chunked frame` test above is weak; replace its middle with an assertion the mock actually supports after Task 2 Step 4's mock update (see Step 4 for the strengthened version). Until then, run it as-is — it must pass once reassembly works because a broken reassembler leaves `set_model` pending forever and the follow-up `ping_echo` times out.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd oh-my-pi-desktop && npx vitest run test/rpc-client.test.ts`
Expected: FAIL — `Cannot find module '../src/main/rpc-client'`.

- [ ] **Step 3: Write `rpc-types.ts` and `rpc-client.ts`**

Write `oh-my-pi-desktop/src/main/rpc-types.ts` with exactly the types from the Interfaces block above (copy verbatim).

Write `oh-my-pi-desktop/src/main/rpc-client.ts`:

```ts
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
  private stopped = false
  private v2 = false
  private readonly opts: Required<RpcClientOptions>

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
    this.stopped = false
    const env = { ...process.env, ...this.opts.env }
    const bin = this.opts.scriptMode ? process.execPath : this.opts.ompPath
    const args = this.opts.scriptMode
      ? [this.opts.ompPath, '--mode', 'rpc', '--cwd', this.opts.cwd]
      : ['--mode', 'rpc', '--cwd', this.opts.cwd]
    this.child = spawn(bin, args, {
      cwd: this.opts.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
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
          this.v2 = true
          this.finishReady()
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
    this.stopped = true
    const child = this.child
    this.child = null
    const err = new Error('RpcClient stopped')
    for (const p of this.pending.values()) p.reject(err)
    this.pending.clear()
    child.stdin.end()
    const killer = setTimeout(() => child.kill('SIGKILL'), 5000)
    child.once('exit', () => clearTimeout(killer))
    child.kill()
  }
}
```

- [ ] **Step 4: Strengthen the chunked-frame test and mock, then run all tests**

Update `test/rpc-client.test.ts` — replace the weak chunk assertion with a deterministic one. The mock's `set_model` command emits the chunked frame with **no** trailing response; change the mock so the reassembled frame IS the response: emit the `response` object itself as a chunked sequence. Replace the `set_model` case in `test/fixtures/mock-omp.mjs` with:

```js
    case 'set_model': {
      msgSeq++
      const payload = { id: cmd.id, type: 'response', command: 'set_model', success: true, data: { ok: true } }
      const json = JSON.stringify(payload)
      const b64 = Buffer.from(json, 'utf8').toString('base64')
      const bytes = Buffer.byteLength(b64, 'utf8')
      const count = Math.ceil(bytes / 8) // tiny segments force multi-chunk reassembly
      for (let i = 0; i < count; i++) {
        emit({
          type: 'rpc_chunk',
          chunkId: 'chunk-big',
          index: i,
          count,
          byteLength: bytes,
          data: b64.slice(i * 8, (i + 1) * 8)
        })
      }
      break
    }
```

And replace the chunk test body in `test/rpc-client.test.ts` with:

```ts
  it('reassembles a v2 chunked response frame', async () => {
    const c = makeClient()
    await c.start()
    const data = await c.send({ type: 'set_model', provider: 'mock', modelId: 'mock-1' })
    expect(data).toEqual({ ok: true })
  })
```

Run: `npx vitest run test/rpc-client.test.ts`
Expected: 5 tests PASS. If the chunk test fails, the reassembler (`pushChunk` + dispatch recursion) is the suspect — `byteLength` is the byte length of the base64 string (`Buffer.byteLength(b64, 'utf8')`), and segments split by character index, which matches `slice` semantics.

- [ ] **Step 5: Typecheck**

Run: `npx tsc -p tsconfig.node.json --noEmit`
Expected: exit 0. (The `never_answered` mock case emits no response — fine; the client's pending is rejected by `stop()`.)

- [ ] **Step 6: Stage**

```bash
git add oh-my-pi-desktop/src/main/rpc-types.ts oh-my-pi-desktop/src/main/rpc-client.ts oh-my-pi-desktop/test vitest.config.ts && git status --porcelain
```

Expected: new files staged.

---

### Task 3: Agent host + IPC bridge + preload API

**Files:**
- Create: `oh-my-pi-desktop/src/main/agent-host.ts`
- Create: `oh-my-pi-desktop/src/main/ipc.ts`
- Create: `oh-my-pi-desktop/src/preload/index.ts` (rewrite)
- Create: `oh-my-pi-desktop/src/renderer/src/api.ts`
- Modify: `oh-my-pi-desktop/src/main/index.ts`

**Interfaces:**
- Consumes: `RpcClient` from Task 2.
- Produces (renderer + later tasks rely on these):

```ts
// agent-host.ts
export type ConnectionStatus = 'starting' | 'connected' | 'reconnecting' | 'offline'
export class AgentHost {
  constructor(opts: { ompPath: string })
  get status(): ConnectionStatus
  get project(): string | null
  connect(project: string): Promise<void>   // spawn client; on exit → auto-reconnect same project
  disconnect(): void
  prompt(text: string, streamingBehavior?: 'steer' | 'followUp'): Promise<unknown>
  steer(text: string): Promise<unknown>
  followUp(text: string): Promise<unknown>
  abort(): Promise<unknown>
  newSession(parentSession?: string): Promise<unknown>
  switchSession(path: string): Promise<unknown>
  renameSession(name: string): Promise<unknown>
  exportHtml(outputPath?: string): Promise<unknown>
  getState(): Promise<unknown>
  getModels(): Promise<unknown>
  setModel(provider: string, modelId: string): Promise<unknown>
  setThinkingLevel(level: string): Promise<unknown>
  setFastMode(enabled: boolean): Promise<unknown>
  getMessagesPage(cursor?: string, limit?: number): Promise<unknown>
  onEvent(cb: (frame: Record<string, unknown>) => void): () => void
  onUiRequest(cb: (req: Record<string, unknown>) => void): () => void
  onStatus(cb: (s: ConnectionStatus) => void): () => void
}
```

```ts
// preload → window.omp (renderer/src/api.ts mirrors this)
export interface OmpApi {
  connect(project: string): Promise<{ ok: true } | { ok: false; error: string }>
  disconnect(): Promise<void>
  getStatus(): Promise<{ status: string; project: string | null; pid: number | null }>
  pickProject(): Promise<string | null>
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
  listSessions(cwd: string): Promise<import('./session-scanner').SessionSummary[]>
  onEvent(cb: (frame: Record<string, unknown>) => void): () => void
  onUiRequest(cb: (req: Record<string, unknown>) => void): () => void
  onStatus(cb: (status: string) => void): () => void
}
```

- [ ] **Step 1: Write the failing test for AgentHost reconnect behavior**

Write `oh-my-pi-desktop/test/agent-host.test.ts`:

```ts
import { describe, expect, it, afterEach } from 'vitest'
import { join } from 'path'
import { AgentHost } from '../src/main/agent-host'

const MOCK = join(__dirname, 'fixtures', 'mock-omp.mjs')
const hosts: AgentHost[] = []

afterEach(() => {
  for (const h of hosts.splice(0)) h.disconnect()
})

describe('AgentHost', () => {
  it('connects, forwards events, and reports status transitions', async () => {
    const h = new AgentHost({ ompPath: MOCK, spawnAsNode: true })
    hosts.push(h)
    const statuses: string[] = []
    h.onStatus((s) => statuses.push(s))
    await h.connect(process.cwd())
    expect(h.status).toBe('connected')
    const events: string[] = []
    const off = h.onEvent((f) => events.push(f.type as string))
    await h.prompt('hi')
    off()
    expect(events).toContain('agent_start')
    expect(events).toContain('tool_execution_start')
    expect(events).toContain('agent_end')
    expect(statuses).toContain('connected')
  })

  it('auto-reconnects when the agent process exits', async () => {
    const h = new AgentHost({ ompPath: MOCK, spawnAsNode: true })
    hosts.push(h)
    const statuses: string[] = []
    const off = h.onStatus((s) => statuses.push(s))
    await h.connect(process.cwd())
    // Kill the agent process via a mock command; host must auto-reconnect.
    await h.client!.send({ type: 'die' })
    // Reconnect is async; poll for connected
    await new Promise<void>((resolve, reject) => {
      const t = setInterval(() => {
        if (h.status === 'connected') {
          clearInterval(t)
          resolve()
        }
      }, 50)
      setTimeout(() => { clearInterval(t); reject(new Error('did not reconnect')) }, 5000)
    })
    off()
    expect(statuses).toContain('reconnecting')
    expect(statuses).toContain('connected')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/agent-host.test.ts`
Expected: FAIL — `Cannot find module '../src/main/agent-host'`.

- [ ] **Step 3: Write `agent-host.ts`**

```ts
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
```

- [ ] **Step 4: Update the mock to handle the host test**

`test/fixtures/mock-omp.mjs` already handles `prompt`/`abort`/`get_state`. Add a `die` command so the reconnect test can kill the process deterministically (the reconnect test in Step 1 already sends `{ type: 'die' }`):

```js
    case 'die':
      process.exit(0)
      break
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run test/agent-host.test.ts`
Expected: 2 tests PASS.

- [ ] **Step 6: Write the IPC bridge, preload, and wire main**

Write `oh-my-pi-desktop/src/main/ipc.ts`:

```ts
import { app, dialog, ipcMain, BrowserWindow } from 'electron'
import { AgentHost } from './agent-host'
import { scanSessions } from './session-scanner'

export function registerIpc(host: AgentHost): void {
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
```

> `session-scanner` doesn't exist yet (Task 5). To keep this task green, add a temporary stub now and replace it in Task 5:

Create `oh-my-pi-desktop/src/main/session-scanner.ts`:

```ts
export interface SessionSummary {
  path: string
  title: string
  cwd: string
  mtimeMs: number
  sizeBytes: number
}

export function scanSessions(_baseDir: string, _projectCwd: string): SessionSummary[] {
  return [] // Task 5: real scanner
}
```

Rewrite `oh-my-pi-desktop/src/preload/index.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { OmpApi } from '../shared/omp-api'

function subscribe(channel: string, cb: (payload: unknown) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, payload: unknown): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: OmpApi = {
  connect: (project) => ipcRenderer.invoke('omp:connect', project),
  disconnect: () => ipcRenderer.invoke('omp:disconnect'),
  getStatus: () => ipcRenderer.invoke('omp:status'),
  pickProject: () => ipcRenderer.invoke('omp:pick_project'),
  prompt: (text) => ipcRenderer.invoke('omp:prompt', text),
  steer: (text) => ipcRenderer.invoke('omp:steer', text),
  followUp: (text) => ipcRenderer.invoke('omp:follow_up', text),
  abort: () => ipcRenderer.invoke('omp:abort'),
  newSession: (parent) => ipcRenderer.invoke('omp:new_session', parent),
  switchSession: (path) => ipcRenderer.invoke('omp:switch_session', path),
  renameSession: (name) => ipcRenderer.invoke('omp:rename_session', name),
  exportHtml: () => ipcRenderer.invoke('omp:export_html'),
  getState: () => ipcRenderer.invoke('omp:get_state'),
  getModels: () => ipcRenderer.invoke('omp:get_models'),
  setModel: (provider, modelId) => ipcRenderer.invoke('omp:set_model', provider, modelId),
  setThinkingLevel: (level) => ipcRenderer.invoke('omp:set_thinking_level', level),
  setFastMode: (enabled) => ipcRenderer.invoke('omp:set_fast_mode', enabled),
  getMessagesPage: (cursor, limit) => ipcRenderer.invoke('omp:get_messages_page', cursor, limit),
  listSessions: (cwd) => ipcRenderer.invoke('omp:list_sessions', cwd),
  uiResponse: (id, value, confirmed, cancelled) => ipcRenderer.invoke('omp:ui_response', id, value, confirmed, cancelled),
  onEvent: (cb) => subscribe('omp:event', cb),
  onUiRequest: (cb) => subscribe('omp:ui_request', cb),
  onStatus: (cb) => subscribe('omp:status', cb)
}

contextBridge.exposeInMainWorld('omp', api)
```

Create the shared API type `oh-my-pi-desktop/src/shared/omp-api.ts` (used by preload and renderer):

```ts
export interface OmpApi {
  connect(project: string): Promise<{ ok: true } | { ok: false; error: string }>
  disconnect(): Promise<void>
  getStatus(): Promise<{ status: string; project: string | null; pid: number | null }>
  pickProject(): Promise<string | null>
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
}
```

Create `oh-my-pi-desktop/src/renderer/src/api.ts`:

```ts
import type { OmpApi } from '../../shared/omp-api'

declare global {
  interface Window {
    omp: OmpApi
  }
}

export const api: OmpApi = window.omp
```

Wire `oh-my-pi-desktop/src/main/index.ts` — replace the `createWindow` body's post-load section and add host wiring:

```ts
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { AgentHost } from './agent-host'
import { registerIpc } from './ipc'
```

and inside `app.whenReady().then(() => {` before `createWindow()`:

```ts
    const host = new AgentHost({ ompPath: 'omp' })
    registerIpc(host)
    createWindow()
```

Also add `sandbox: false` to `webPreferences` (preload imports `../shared/omp-api` as ESM — electron-vite bundles preload to CJS, but type-only imports are erased; keep `sandbox: true` if the build passes, otherwise set `sandbox: false`).

- [ ] **Step 7: Verify build + typecheck**

Run: `cd oh-my-pi-desktop && npm run build && npx tsc -p tsconfig.node.json --noEmit`
Expected: build emits `out/`, typecheck exits 0.

Run: `npm run dev` briefly.
Expected: window opens; DevTools console shows no preload errors.

- [ ] **Step 8: Stage**

```bash
git add oh-my-pi-desktop/src/main/agent-host.ts oh-my-pi-desktop/src/main/ipc.ts oh-my-pi-desktop/src/main/session-scanner.ts oh-my-pi-desktop/src/preload/index.ts oh-my-pi-desktop/src/shared oh-my-pi-desktop/src/renderer/src/api.ts oh-my-pi-desktop/src/main/index.ts oh-my-pi-desktop/test/agent-host.test.ts oh-my-pi-desktop/test/fixtures/mock-omp.mjs && git status --porcelain
```

---

### Task 4: Chat UI — composer, transcript, streaming markdown, tool cards

**Files:**
- Create: `oh-my-pi-desktop/src/renderer/src/store.ts`
- Create: `oh-my-pi-desktop/src/renderer/src/lib/transcript.ts`
- Create: `oh-my-pi-desktop/src/renderer/src/lib/markdown.tsx`
- Create: `oh-my-pi-desktop/src/renderer/src/components/Composer.tsx`
- Create: `oh-my-pi-desktop/src/renderer/src/components/Transcript.tsx`
- Create: `oh-my-pi-desktop/src/renderer/src/components/MessageView.tsx`
- Create: `oh-my-pi-desktop/src/renderer/src/components/ToolCallCard.tsx`
- Create: `oh-my-pi-desktop/src/renderer/src/components/StatusBar.tsx`
- Create: `oh-my-pi-desktop/src/renderer/src/components/Sidebar.tsx` (stub shell for Task 5)
- Modify: `oh-my-pi-desktop/src/renderer/src/App.tsx`
- Create: `oh-my-pi-desktop/test/transcript.test.ts`

**Interfaces:**
- Consumes: `window.omp` API (Task 3).
- Produces (later tasks use): `useAppStore` zustand store with `sendPrompt(text)`, `abort()`, `messages`, `isStreaming`, `status`; `applyEvent(messages, ev)` reducer; `TranscriptMessage`/`ToolCallView` types.

```ts
// transcript.ts
export interface ToolCallView {
  id: string
  name: string
  args: unknown
  status: 'running' | 'ok' | 'error'
  result?: unknown
  error?: string
}
export interface TranscriptMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  thinking: string
  toolCalls: ToolCallView[]
  complete: boolean
}
export function applyEvent(messages: TranscriptMessage[], ev: Record<string, unknown>): TranscriptMessage[]
```

- [ ] **Step 1: Write the failing reducer tests**

Write `oh-my-pi-desktop/test/transcript.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { applyEvent, type TranscriptMessage } from '../src/renderer/src/lib/transcript'

const empty: TranscriptMessage[] = []

describe('applyEvent', () => {
  it('streams text deltas into a single assistant message', () => {
    let m = applyEvent(empty, { type: 'agent_start' })
    m = applyEvent(m, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Hel' }, message: { role: 'assistant', content: [] } })
    m = applyEvent(m, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'lo' }, message: { role: 'assistant', content: [] } })
    expect(m).toHaveLength(1)
    expect(m[0]).toMatchObject({ role: 'assistant', text: 'Hello', complete: false })
    m = applyEvent(m, { type: 'agent_end', messages: [] })
    expect(m[0].complete).toBe(true)
  })

  it('tracks tool execution start/end as cards', () => {
    let m = applyEvent(empty, { type: 'tool_execution_start', toolCallId: 't1', name: 'read', args: { path: 'a' } })
    expect(m[0].toolCalls[0]).toMatchObject({ id: 't1', name: 'read', status: 'running' })
    m = applyEvent(m, { type: 'tool_execution_end', toolCallId: 't1', success: true, result: 'ok' })
    expect(m[0].toolCalls[0].status).toBe('ok')
    m = applyEvent(m, { type: 'tool_execution_end', toolCallId: 't2', success: false, error: 'boom' })
    expect(m[0].toolCalls[1]).toMatchObject({ id: 't2', status: 'error', error: 'boom' })
  })

  it('renders user messages appended by the app', () => {
    // sendPrompt appends a user message locally before calling the agent
    const withUser = [...empty, { id: 'u1', role: 'user' as const, text: 'hi', thinking: '', toolCalls: [], complete: true }]
    const m = applyEvent(withUser, { type: 'agent_start' })
    expect(m).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/transcript.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `transcript.ts`**

```ts
export interface ToolCallView {
  id: string
  name: string
  args: unknown
  status: 'running' | 'ok' | 'error'
  result?: unknown
  error?: string
}

export interface TranscriptMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  thinking: string
  toolCalls: ToolCallView[]
  complete: boolean
}

function lastAssistant(messages: TranscriptMessage[]): TranscriptMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'assistant' && !m.complete) return m
  }
  return null
}

export function applyEvent(messages: TranscriptMessage[], ev: Record<string, unknown>): TranscriptMessage[] {
  const type = ev.type as string
  switch (type) {
    case 'agent_start':
    case 'turn_start': {
      const open = lastAssistant(messages)
      if (open) return messages
      return [...messages, { id: `a_${ev.timestamp ?? Date.now()}`, role: 'assistant', text: '', thinking: '', toolCalls: [], complete: false }]
    }
    case 'message_update': {
      const msg = ev.message as { role?: string } | undefined
      if (msg?.role === 'user') return messages
      const ae = ev.assistantMessageEvent as Record<string, unknown> | undefined
      const delta = typeof ae?.delta === 'string' ? ae.delta : ''
      if (!delta) return messages
      const open = lastAssistant(messages)
      if (!open) return messages
      const idx = messages.indexOf(open)
      const next = [...messages]
      next[idx] = { ...open, text: open.text + delta }
      return next
    }
    case 'message_end': {
      const open = lastAssistant(messages)
      if (!open) return messages
      const idx = messages.indexOf(open)
      const next = [...messages]
      next[idx] = { ...open, complete: true }
      return next
    }
    case 'tool_execution_start': {
      const card: ToolCallView = {
        id: String(ev.toolCallId ?? ev.id ?? `t_${Date.now()}`),
        name: String(ev.name ?? 'tool'),
        args: ev.args ?? {},
        status: 'running'
      }
      const open = lastAssistant(messages)
      if (!open) return [...messages]
      const idx = messages.indexOf(open)
      const next = [...messages]
      next[idx] = { ...open, toolCalls: [...open.toolCalls, card] }
      return next
    }
    case 'tool_execution_update': {
      const id = String(ev.toolCallId ?? ev.id ?? '')
      if (!id) return messages
      return updateTool(messages, id, (t) => ({ ...t, args: ev.args ?? t.args, result: ev.result ?? t.result }))
    }
    case 'tool_execution_end': {
      const id = String(ev.toolCallId ?? ev.id ?? '')
      const success = ev.success !== false
      const err = typeof ev.error === 'string' ? ev.error : undefined
      return updateTool(messages, id, (t) => ({
        ...t,
        status: success ? 'ok' : 'error',
        result: ev.result ?? t.result,
        error: err ?? (success ? undefined : String(ev.error ?? 'tool failed'))
      }))
    }
    default:
      return messages
  }
}

function updateTool(messages: TranscriptMessage[], id: string, fn: (t: ToolCallView) => ToolCallView): TranscriptMessage[] {
  const next = messages.map((m) => {
    if (m.toolCalls.length === 0) return m
    let changed = false
    const toolCalls = m.toolCalls.map((t) => {
      if (t.id !== id) return t
      changed = true
      return fn(t)
    })
    return changed ? { ...m, toolCalls } : m
  })
  return next
}

export function pushUserMessage(messages: TranscriptMessage[], text: string): TranscriptMessage[] {
  return [...messages, { id: `u_${Date.now()}`, role: 'user', text, thinking: '', toolCalls: [], complete: true }]
}
```

- [ ] **Step 4: Run reducer tests**

Run: `npx vitest run test/transcript.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 5: Write markdown + components**

Write `oh-my-pi-desktop/src/renderer/src/lib/markdown.tsx`:

```tsx
import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'

export function Markdown({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: ({ children }) => (
            <div className="code-block">
              <button
                className="copy-btn"
                onClick={() => void navigator.clipboard.writeText(extractText(children))}
              >
                copy
              </button>
              <pre>{children}</pre>
            </div>
          )
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode } | null
    return props?.children ? extractText(props.children) : ''
  }
  return ''
}
```

Write `oh-my-pi-desktop/src/renderer/src/store.ts`:

```ts
import { create } from 'zustand'
import { api } from './api'
import { applyEvent, pushUserMessage, type TranscriptMessage } from './lib/transcript'

interface AppState {
  status: string
  project: string | null
  sessions: { path: string; title: string; cwd: string; mtimeMs: number; sizeBytes: number }[]
  activeSessionPath: string | null
  messages: TranscriptMessage[]
  isStreaming: boolean
  uiRequest: Record<string, unknown> | null
  toasts: { id: number; text: string; kind: 'error' | 'info' }[]
  model: { provider: string; id: string } | null
  thinkingLevel: string
  contextUsage: { tokens: number; contextWindow: number; percent: number } | null
  tokensPerSecond: number | null
  sessionName: string
  sendPrompt: (text: string) => Promise<void>
  abort: () => Promise<void>
  refreshSessions: () => Promise<void>
  pickProjectAndConnect: () => Promise<void>
  connect: (project: string) => Promise<void>
  switchSession: (path: string) => Promise<void>
  newSession: () => Promise<void>
  renameSession: (name: string) => Promise<void>
  loadOlder: () => Promise<void>
  answerUi: (id: string, value: unknown, confirmed?: boolean, cancelled?: boolean) => Promise<void>
  toast: (text: string, kind?: 'error' | 'info') => void
}

let toastSeq = 0

export const useAppStore = create<AppState>((set, get) => ({
  status: 'offline',
  project: null,
  sessions: [],
  activeSessionPath: null,
  messages: [],
  isStreaming: false,
  uiRequest: null,
  toasts: [],
  model: null,
  thinkingLevel: 'medium',
  contextUsage: null,
  tokensPerSecond: null,
  sessionName: '',

  toast: (text, kind = 'info') => {
    const id = ++toastSeq
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 6000)
  },

  sendPrompt: async (text) => {
    const trimmed = text.trim()
    if (!trimmed) return
    set((s) => ({ messages: pushUserMessage(s.messages, trimmed) }))
    try {
      await api.prompt(trimmed)
    } catch (e) {
      get().toast(`Prompt failed: ${(e as Error).message}`, 'error')
    }
  },

  abort: async () => {
    try {
      await api.abort()
    } catch (e) {
      get().toast(`Abort failed: ${(e as Error).message}`, 'error')
    }
  },

  refreshSessions: async () => {
    const { project } = get()
    if (!project) return
    try {
      const sessions = await api.listSessions(project)
      set({ sessions })
    } catch (e) {
      get().toast(`Session list failed: ${(e as Error).message}`, 'error')
    }
  },

  pickProjectAndConnect: async () => {
    const project = await api.pickProject()
    if (project) await get().connect(project)
  },

  connect: async (project) => {
    const res = await api.connect(project)
    if (!res.ok) {
      get().toast(`Connect failed: ${res.error}`, 'error')
      return
    }
    set({ project })
    await get().refreshSessions()
  },

  switchSession: async (path) => {
    try {
      await api.switchSession(path)
      set({ activeSessionPath: path, messages: [], isStreaming: false })
      await get().loadOlder()
    } catch (e) {
      get().toast(`Switch failed: ${(e as Error).message}`, 'error')
    }
  },

  newSession: async () => {
    try {
      await api.newSession()
      set({ activeSessionPath: null, messages: [], isStreaming: false, sessionName: '' })
    } catch (e) {
      get().toast(`New session failed: ${(e as Error).message}`, 'error')
    }
  },

  renameSession: async (name) => {
    try {
      await api.renameSession(name)
      set({ sessionName: name })
    } catch (e) {
      get().toast(`Rename failed: ${(e as Error).message}`, 'error')
    }
  },

  loadOlder: async () => {
    try {
      const page = (await api.getMessagesPage(undefined, 100)) as {
        messages?: unknown[]
        totalMessages?: number
        nextCursor?: string
      }
      if (Array.isArray(page.messages)) {
        set((s) => ({ messages: [...s.messages, ...(page.messages as TranscriptMessage[])] }))
      }
    } catch (e) {
      get().toast(`History load failed: ${(e as Error).message}`, 'error')
    }
  },

  answerUi: async (id, value, confirmed, cancelled) => {
    set({ uiRequest: null })
    try {
      await api.uiResponse(id, value, confirmed, cancelled)
    } catch (e) {
      get().toast(`UI response failed: ${(e as Error).message}`, 'error')
    }
  }
}))

// Event wiring: attach once at module load.
api.onStatus((status) => {
  useAppStore.setState({ status })
})
api.onEvent((frame) => {
  const s = useAppStore.getState()
  const type = frame.type as string
  if (type === 'agent_start' || type === 'turn_start') useAppStore.setState({ isStreaming: true })
  if (type === 'agent_end' || type === 'turn_end') useAppStore.setState({ isStreaming: false })
  if (type === 'todo_reminder' || type === 'todo_auto_clear') {
    // Task 8 fills this in
  }
  if (type === 'model_changed') useAppStore.setState({ model: (frame as { model?: { provider: string; id: string } }).model ?? null })
  if (type === 'thinking_level_changed') useAppStore.setState({ thinkingLevel: String((frame as { level?: string }).level ?? s.thinkingLevel) })
  if (type === 'notice') s.toast(String((frame as { message?: string }).message ?? 'notice'), 'info')
  if (type === 'message_update' || type === 'tool_execution_start' || type === 'tool_execution_update' || type === 'tool_execution_end' || type === 'message_end') {
    useAppStore.setState((prev) => ({ messages: applyEvent(prev.messages, frame) }))
  }
})
api.onUiRequest((req) => useAppStore.setState({ uiRequest: req }))
```

Write `oh-my-pi-desktop/src/renderer/src/components/Composer.tsx`:

```tsx
import React, { useState } from 'react'
import { useAppStore } from '../store'
import { Send, Square } from 'lucide-react'

export function Composer(): React.JSX.Element {
  const [text, setText] = useState('')
  const isStreaming = useAppStore((s) => s.isStreaming)
  const sendPrompt = useAppStore((s) => s.sendPrompt)
  const abort = useAppStore((s) => s.abort)

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (!text.trim()) return
    void sendPrompt(text)
    setText('')
  }

  return (
    <form className="composer" onSubmit={submit}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            ;(e.currentTarget.form as HTMLFormElement).requestSubmit()
          }
        }}
        placeholder="Message the agent…  (Enter to send, Shift+Enter for newline)"
        rows={1}
        autoFocus
      />
      {isStreaming ? (
        <button type="button" className="btn danger" onClick={() => void abort()} title="Abort">
          <Square size={16} />
        </button>
      ) : (
        <button type="submit" className="btn primary" disabled={!text.trim()} title="Send">
          <Send size={16} />
        </button>
      )}
    </form>
  )
}
```

Write `oh-my-pi-desktop/src/renderer/src/components/ToolCallCard.tsx`:

```tsx
import React, { useState } from 'react'
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronRight } from 'lucide-react'
import type { ToolCallView } from '../lib/transcript'

export function ToolCallCard({ tool }: { tool: ToolCallView }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const Icon = tool.status === 'running' ? Loader2 : tool.status === 'ok' ? CheckCircle2 : XCircle
  return (
    <div className={`tool-card ${tool.status}`}>
      <button className="tool-card-head" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Icon size={14} className="tool-icon" />
        <code>{tool.name}</code>
        <span className="tool-status">{tool.status}</span>
      </button>
      {open && (
        <div className="tool-card-body">
          <pre>{JSON.stringify(tool.args, null, 2)}</pre>
          {tool.error !== undefined && <pre className="tool-error">{tool.error}</pre>}
          {tool.result !== undefined && tool.error === undefined && <pre>{typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result, null, 2)}</pre>}
        </div>
      )}
    </div>
  )
}
```

Write `oh-my-pi-desktop/src/renderer/src/components/MessageView.tsx`:

```tsx
import React from 'react'
import { Markdown } from '../lib/markdown'
import { ToolCallCard } from './ToolCallCard'
import type { TranscriptMessage } from '../lib/transcript'

export function MessageView({ message }: { message: TranscriptMessage }): React.JSX.Element {
  const isUser = message.role === 'user'
  return (
    <div className={`message ${isUser ? 'user' : 'assistant'}`}>
      {!isUser && message.thinking && (
        <details className="thinking">
          <summary>Thinking</summary>
          <pre>{message.thinking}</pre>
        </details>
      )}
      {isUser ? (
        <div className="bubble">{message.text}</div>
      ) : (
        <div className="bubble">
          <Markdown text={message.text} />
          {message.toolCalls.map((t) => (
            <ToolCallCard key={t.id} tool={t} />
          ))}
        </div>
      )}
    </div>
  )
}
```

Write `oh-my-pi-desktop/src/renderer/src/components/Transcript.tsx`:

```tsx
import React, { useEffect, useRef } from 'react'
import { useAppStore } from '../store'
import { MessageView } from './MessageView'

export function Transcript(): React.JSX.Element {
  const messages = useAppStore((s) => s.messages)
  const isStreaming = useAppStore((s) => s.isStreaming)
  const bottomRef = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  useEffect(() => {
    if (pinned.current) bottomRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [messages])

  const onScroll = (e: React.UIEvent<HTMLDivElement>): void => {
    const el = e.currentTarget
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  return (
    <div className="transcript" onScroll={onScroll}>
      {messages.length === 0 && !isStreaming && (
        <div className="empty-hint">Pick a session on the left, or send a message to start a new one.</div>
      )}
      {messages.map((m) => (
        <MessageView key={m.id} message={m} />
      ))}
      {isStreaming && <div className="streaming-dot" />}
      <div ref={bottomRef} />
    </div>
  )
}
```

Write `oh-my-pi-desktop/src/renderer/src/components/StatusBar.tsx`:

```tsx
import React from 'react'
import { useAppStore } from '../store'

export function StatusBar(): React.JSX.Element {
  const status = useAppStore((s) => s.status)
  const model = useAppStore((s) => s.model)
  const contextUsage = useAppStore((s) => s.contextUsage)
  const tokensPerSecond = useAppStore((s) => s.tokensPerSecond)
  const isStreaming = useAppStore((s) => s.isStreaming)
  return (
    <footer className="status-bar">
      <span className={`dot ${status}`} />
      <span>{status}</span>
      {model && <span className="sep">{model.provider}/{model.id}</span>}
      {contextUsage && (
        <span className="sep">
          context {contextUsage.tokens.toLocaleString()} / {Math.round(contextUsage.percent * 100)}%
        </span>
      )}
      {tokensPerSecond != null && <span className="sep">{tokensPerSecond.toFixed(0)} tok/s</span>}
      {isStreaming && <span className="sep streaming">streaming…</span>}
    </footer>
  )
}
```

Write `oh-my-pi-desktop/src/renderer/src/components/Sidebar.tsx` (shell; Task 5 fills sessions):

```tsx
import React from 'react'
import { useAppStore } from '../store'

export function Sidebar(): React.JSX.Element {
  const project = useAppStore((s) => s.project)
  const pickProjectAndConnect = useAppStore((s) => s.pickProjectAndConnect)
  return (
    <aside className="sidebar">
      <button className="project-picker" onClick={() => void pickProjectAndConnect()}>
        {project ? project : 'Choose a project…'}
      </button>
      <div className="sidebar-note">Sessions appear here once connected (Task 5).</div>
    </aside>
  )
}
```

Rewrite `oh-my-pi-desktop/src/renderer/src/App.tsx`:

```tsx
import React, { useEffect } from 'react'
import { useAppStore } from './store'
import { Sidebar } from './components/Sidebar'
import { Transcript } from './components/Transcript'
import { Composer } from './components/Composer'
import { StatusBar } from './components/StatusBar'
import { UiRequestModal } from './components/UiRequestModal'
import { Toasts } from './components/Toasts'

export default function App(): React.JSX.Element {
  const project = useAppStore((s) => s.project)
  useEffect(() => {
    // Task 9: restore remembered project from store instead of prompting.
    void useAppStore.getState().pickProjectAndConnect()
  }, [])
  return (
    <div className="app">
      <div className="app-body">
        <Sidebar />
        <main className="chat">
          <Transcript />
          <Composer />
        </main>
      </div>
      <StatusBar />
      {project === null && <div className="onboarding-hint">Choose a project directory to start.</div>}
      <UiRequestModal />
      <Toasts />
    </div>
  )
}
```

The referenced `UiRequestModal` and `Toasts` don't exist until Tasks 7 and 9. To keep this task green, create minimal placeholders now:

Write `oh-my-pi-desktop/src/renderer/src/components/UiRequestModal.tsx`:

```tsx
import React from 'react'
import { useAppStore } from '../store'

export function UiRequestModal(): React.JSX.Element | null {
  const req = useAppStore((s) => s.uiRequest)
  if (!req) return null
  return <div className="modal">UI request incoming — wired in Task 7.</div>
}
```

Write `oh-my-pi-desktop/src/renderer/src/components/Toasts.tsx`:

```tsx
import React from 'react'
import { useAppStore } from '../store'

export function Toasts(): React.JSX.Element {
  const toasts = useAppStore((s) => s.toasts)
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 6: Append chat styles to `styles/global.css`**

```css
.app-body { display: flex; flex: 1; min-height: 0; }
.sidebar { width: 260px; border-right: 1px solid var(--border); background: var(--bg-raised); display: flex; flex-direction: column; padding: 12px; gap: 8px; overflow-y: auto; }
.project-picker { background: var(--bg-hover); border: 1px solid var(--border); color: var(--text); border-radius: 8px; padding: 10px 12px; cursor: pointer; font-size: 13px; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sidebar-note { color: var(--text-dim); font-size: 12px; padding: 8px; }
.chat { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.transcript { flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
.empty-hint { color: var(--text-dim); text-align: center; margin-top: 40px; }
.message { display: flex; }
.message.user { justify-content: flex-end; }
.bubble { max-width: 82%; border-radius: 10px; padding: 10px 14px; }
.message.user .bubble { background: var(--accent-soft); border: 1px solid rgba(79, 156, 249, 0.35); }
.message.assistant .bubble { background: var(--bg-raised); border: 1px solid var(--border); width: 100%; }
.thinking { margin-bottom: 8px; color: var(--text-dim); font-size: 12px; }
.thinking pre { white-space: pre-wrap; }
.streaming-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); animation: pulse 1s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
.composer { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--border); background: var(--bg-raised); }
.composer textarea { flex: 1; resize: none; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; font: inherit; line-height: 1.4; max-height: 200px; }
.composer textarea:focus { outline: none; border-color: var(--accent); }
.btn { border: none; border-radius: 8px; padding: 0 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.btn.primary { background: var(--accent); color: #fff; }
.btn.primary:disabled { opacity: 0.4; cursor: default; }
.btn.danger { background: var(--err); color: #fff; }
.tool-card { border: 1px solid var(--border); border-radius: 8px; margin: 8px 0; background: var(--bg); }
.tool-card.running { border-color: var(--accent); }
.tool-card.ok { border-color: var(--ok); }
.tool-card.error { border-color: var(--err); }
.tool-card-head { width: 100%; display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: none; border: none; color: var(--text); cursor: pointer; font: inherit; }
.tool-icon { flex-shrink: 0; }
.tool-card.running .tool-icon { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.tool-status { margin-left: auto; font-size: 11px; text-transform: uppercase; color: var(--text-dim); }
.tool-card-body { padding: 0 10px 10px; }
.tool-card-body pre { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 8px; overflow-x: auto; font-size: 12px; max-height: 240px; }
.tool-error { color: var(--err); }
.status-bar { display: flex; align-items: center; gap: 8px; padding: 6px 14px; border-top: 1px solid var(--border); color: var(--text-dim); font-size: 12px; }
.dot { width: 8px; height: 8px; border-radius: 50%; }
.dot.connected { background: var(--ok); }
.dot.starting, .dot.reconnecting { background: var(--warn); }
.dot.offline { background: var(--err); }
.sep { margin-left: 4px; }
.streaming { color: var(--accent); }
.markdown { line-height: 1.55; overflow-wrap: anywhere; }
.markdown pre { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; overflow-x: auto; }
.code-block { position: relative; }
.copy-btn { position: absolute; top: 6px; right: 8px; background: var(--bg-hover); color: var(--text-dim); border: 1px solid var(--border); border-radius: 6px; font-size: 11px; padding: 2px 8px; cursor: pointer; }
.copy-btn:hover { color: var(--text); }
.toasts { position: fixed; bottom: 40px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; gap: 6px; z-index: 50; }
.toast { background: var(--bg-raised); border: 1px solid var(--border); border-radius: 8px; padding: 8px 14px; font-size: 13px; box-shadow: 0 4px 12px rgba(0,0,0,0.4); }
.toast.error { border-color: var(--err); color: var(--err); }
.modal { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 40; }
```

- [ ] **Step 7: Verify build + reducer tests**

Run: `cd oh-my-pi-desktop && npm run build && npx vitest run`
Expected: all tests PASS (rpc-client 5, agent-host 2, transcript 3), build exits 0.

- [ ] **Step 8: Dev smoke**

Run: `npm run dev` briefly; connect a project in the window; type a prompt.
Expected: the mock isn't used here (real omp), so if no provider is configured the agent errors — that's acceptable at this stage; the UI must still render the prompt and surface the error toast. If omp has an authenticated provider, expect streaming text + tool cards.

- [ ] **Step 9: Stage**

```bash
git add oh-my-pi-desktop/src/renderer oh-my-pi-desktop/test/transcript.test.ts && git status --porcelain
```

---

### Task 5: Sessions — scanner, sidebar, resume/rename/new, history paging

**Files:**
- Rewrite: `oh-my-pi-desktop/src/main/session-scanner.ts` (real implementation)
- Modify: `oh-my-pi-desktop/src/renderer/src/components/Sidebar.tsx`
- Modify: `oh-my-pi-desktop/src/renderer/src/store.ts` (history conversion + paging cursor)
- Create: `oh-my-pi-desktop/src/renderer/src/lib/history.ts`
- Create: `oh-my-pi-desktop/test/session-scanner.test.ts`
- Create: `oh-my-pi-desktop/test/history.test.ts`

**Interfaces:**
- Consumes: `SessionSummary` shape already wired through IPC (Task 3); `get_messages_page` RPC.
- Produces: `scanSessions(baseDir, projectCwd)` (real); `historyToTranscript(rawMessages): TranscriptMessage[]`; store gains `nextCursor`, `loadOlder()` pagination, `switchSession` history replay, `renameSession` UX.

- [ ] **Step 1: Write the failing scanner tests**

Write `oh-my-pi-desktop/test/session-scanner.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, utimesSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { scanSessions } from '../src/main/session-scanner'

function makeSessionDir(): string {
  return mkdtempSync(join(tmpdir(), 'omp-scan-'))
}

function header(cwd: string): string {
  return JSON.stringify({ type: 'session', version: 3, id: 'abc12345', timestamp: '2026-08-03T00:00:00.000Z', cwd, title: 'My Session' })
}

describe('scanSessions', () => {
  it('lists only sessions whose header cwd matches the project (case-insensitive)', () => {
    const dir = makeSessionDir()
    const bucket = join(dir, 'abs-claude-<hash>')
    mkdirSync(bucket, { recursive: true })
    const a = join(bucket, '1_aaaa.jsonl')
    const b = join(bucket, '2_bbbb.jsonl')
    const other = join(bucket, '3_cccc.jsonl')
    const titleSlot = JSON.stringify({ type: 'title', title: 'My Session' }).padEnd(256, ' ') + '\n'
    writeFileSync(a, titleSlot + header('C:\\Users\\Dylan\\downloads\\claude') + '\n')
    writeFileSync(b, titleSlot + header('C:\\Users\\dylan\\downloads\\claude') + '\n')
    writeFileSync(other, titleSlot + header('C:\\Users\\dylan\\other\\project') + '\n')
    const out = scanSessions(dir, 'c:\\users\\dylan\\downloads\\claude')
    expect(out.map((s) => s.path)).toEqual([expect.stringContaining('2_bbbb'), expect.stringContaining('1_aaaa')])
    expect(out[0].title).toBe('My Session')
    expect(out[0].cwd.toLowerCase()).toContain('claude')
  })

  it('handles legacy files without a title slot', () => {
    const dir = makeSessionDir()
    const bucket = join(dir, 'abs-x')
    mkdirSync(bucket, { recursive: true })
    const f = join(bucket, '1_legacy.jsonl')
    writeFileSync(f, header('C:\\Users\\dylan\\downloads\\claude') + '\n')
    const out = scanSessions(dir, 'C:\\Users\\dylan\\downloads\\claude')
    expect(out).toHaveLength(1)
  })

  it('skips corrupt files and empty directories', () => {
    const dir = makeSessionDir()
    const bucket = join(dir, 'abs-x')
    mkdirSync(bucket, { recursive: true })
    writeFileSync(join(bucket, '1_bad.jsonl'), 'not json at all\n')
    expect(scanSessions(dir, 'C:\\Users\\dylan\\downloads\\claude')).toEqual([])
  })

  it('sorts by mtime descending', () => {
    const dir = makeSessionDir()
    const bucket = join(dir, 'abs-x')
    mkdirSync(bucket, { recursive: true })
    const old = join(bucket, '1_old.jsonl')
    const fresh = join(bucket, '2_fresh.jsonl')
    const body = header('C:\\Users\\dylan\\downloads\\claude') + '\n'
    writeFileSync(old, body)
    writeFileSync(fresh, body)
    utimesSync(fresh, new Date(), new Date(Date.now() + 60_000))
    utimesSync(old, new Date(), new Date(Date.now() - 60_000))
    const out = scanSessions(dir, 'C:\\Users\\dylan\\downloads\\claude')
    expect(out.map((s) => s.path)).toEqual([fresh, old])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/session-scanner.test.ts`
Expected: FAIL (current stub returns `[]`).

- [ ] **Step 3: Write the real scanner**

Rewrite `oh-my-pi-desktop/src/main/session-scanner.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

export interface SessionSummary {
  path: string
  title: string
  cwd: string
  mtimeMs: number
  sizeBytes: number
}

const TITLE_SLOT_BYTES = 256

function normalizeCwd(cwd: string): string {
  return cwd.replaceAll('/', '\\').toLowerCase()
}

function parseFirstJsonLine(text: string): Record<string, unknown> | null {
  // A line may be padded to a fixed width with trailing whitespace; parse leniently.
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    try {
      const obj = JSON.parse(line)
      if (obj && typeof obj === 'object') return obj as Record<string, unknown>
    } catch {
      return null
    }
  }
  return null
}

export function scanSessions(baseDir: string, projectCwd: string): SessionSummary[] {
  const target = normalizeCwd(projectCwd)
  const results: SessionSummary[] = []
  let buckets: string[]
  try {
    buckets = readdirSync(baseDir)
  } catch {
    return []
  }
  for (const bucket of buckets) {
    const bucketDir = join(baseDir, bucket)
    let files: string[]
    try {
      if (!statSync(bucketDir).isDirectory()) continue
      files = readdirSync(bucketDir)
    } catch {
      continue
    }
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue
      const path = join(bucketDir, file)
      let st
      try {
        st = statSync(path)
      } catch {
        continue
      }
      let head = ''
      try {
        head = readFileSync(path, { encoding: 'utf8' }).slice(0, 64 * 1024)
      } catch {
        continue
      }
      let text = head
      if (head.startsWith('{') === false && text.length > TITLE_SLOT_BYTES) {
        // strip fixed-width title slot only if the first chunk is not valid JSON
        const first = parseFirstJsonLine(text)
        if (first === null || first.type !== 'session') text = text.slice(TITLE_SLOT_BYTES)
      }
      const hdr = parseFirstJsonLine(text)
      if (!hdr || hdr.type !== 'session' || typeof hdr.cwd !== 'string') continue
      if (normalizeCwd(hdr.cwd) !== target) continue
      results.push({
        path,
        title: typeof hdr.title === 'string' && hdr.title ? hdr.title : file,
        cwd: hdr.cwd,
        mtimeMs: st.mtimeMs,
        sizeBytes: st.size
      })
    }
  }
  results.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return results
}
```

> Note: the title-slot strip condition above is intentionally lenient — if the head already parses as a session header, no strip happens; otherwise drop the first 256 bytes and re-parse. This covers both modern (slot present) and legacy (no slot) files.

- [ ] **Step 4: Run scanner tests**

Run: `npx vitest run test/session-scanner.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 5: History conversion + paging in store**

Write `oh-my-pi-desktop/src/renderer/src/lib/history.ts`:

```ts
import type { TranscriptMessage, ToolCallView } from './transcript'

interface RawBlock {
  type?: string
  text?: string
  thinking?: string
  id?: string
  name?: string
  input?: unknown
  toolUseId?: string
  content?: unknown
  isError?: boolean
}

function toToolCall(b: RawBlock): ToolCallView | null {
  if (b.type !== 'tool_use') return null
  return { id: b.id ?? `h_${Math.random().toString(36).slice(2)}`, name: b.name ?? 'tool', args: b.input ?? {}, status: 'ok' }
}

export function historyToTranscript(raw: unknown[]): TranscriptMessage[] {
  const out: TranscriptMessage[] = []
  for (const m of raw as Array<{ role?: string; content?: unknown; text?: string }>) {
    if (m.role === 'user') {
      const text = typeof m.text === 'string' ? m.text : extractText(m.content)
      out.push({ id: `h_${out.length}`, role: 'user', text, thinking: '', toolCalls: [], complete: true })
      continue
    }
    if (m.role === 'assistant') {
      const blocks = Array.isArray(m.content) ? (m.content as RawBlock[]) : []
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
      const thinking = blocks.filter((b) => b.type === 'thinking').map((b) => b.thinking ?? '').join('')
      const toolCalls = blocks.map(toToolCall).filter((t): t is ToolCallView => t !== null)
      out.push({ id: `h_${out.length}`, role: 'assistant', text, thinking, toolCalls, complete: true })
    }
  }
  return out
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return (content as RawBlock[])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('')
  }
  return ''
}
```

Modify `oh-my-pi-desktop/src/renderer/src/store.ts`:

- Add to state: `nextCursor: string | null`
- Replace `loadOlder` with a version that prepends history pages and tracks the cursor:

```ts
  loadOlder: async () => {
    const { nextCursor } = get()
    try {
      const page = (await api.getMessagesPage(nextCursor ?? undefined, 100)) as {
        messages?: unknown[]
        totalMessages?: number
        nextCursor?: string | null
      }
      const list = Array.isArray(page.messages) ? page.messages : []
      const converted = historyToTranscript(list)
      set((s) => ({
        messages: [...converted, ...s.messages],
        nextCursor: page.nextCursor ?? null
      }))
    } catch (e) {
      get().toast(`History load failed: ${(e as Error).message}`, 'error')
    }
  },
```

- In `switchSession` and `newSession`, reset `nextCursor: null`.
- In `switchSession`, after the switch, load the newest page first: change the flow so `loadOlder()` runs with `nextCursor` null (as written), and expose `loadNewest()` internally:

```ts
  switchSession: async (path) => {
    try {
      await api.switchSession(path)
      set({ activeSessionPath: path, messages: [], isStreaming: false, nextCursor: null })
      await get().loadOlder()
    } catch (e) {
      get().toast(`Switch failed: ${(e as Error).message}`, 'error')
    }
  },
```

- Add `import { historyToTranscript } from './lib/history'` and `nextCursor: null` to the initial state.

Write `oh-my-pi-desktop/test/history.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { historyToTranscript } from '../src/renderer/src/lib/history'

describe('historyToTranscript', () => {
  it('converts user and assistant messages with tool_use blocks', () => {
    const raw = [
      { role: 'user', content: [{ type: 'text', text: 'hi' }] },
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'hmm' },
          { type: 'text', text: 'Let me check' },
          { type: 'tool_use', id: 'tu1', name: 'read', input: { path: 'x' } }
        ]
      }
    ]
    const out = historyToTranscript(raw)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ role: 'user', text: 'hi' })
    expect(out[1]).toMatchObject({ text: 'Let me check', thinking: 'hmm' })
    expect(out[1].toolCalls[0]).toMatchObject({ id: 'tu1', name: 'read', status: 'ok' })
  })
})
```

- [ ] **Step 6: Run history tests**

Run: `npx vitest run test/history.test.ts`
Expected: PASS.

- [ ] **Step 7: Real sidebar**

Rewrite `oh-my-pi-desktop/src/renderer/src/components/Sidebar.tsx`:

```tsx
import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import { Plus, FolderOpen } from 'lucide-react'

export function Sidebar(): React.JSX.Element {
  const project = useAppStore((s) => s.project)
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionPath = useAppStore((s) => s.activeSessionPath)
  const refreshSessions = useAppStore((s) => s.refreshSessions)
  const pickProjectAndConnect = useAppStore((s) => s.pickProjectAndConnect)
  const switchSession = useAppStore((s) => s.switchSession)
  const newSession = useAppStore((s) => s.newSession)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')

  useEffect(() => {
    void refreshSessions()
  }, [project, refreshSessions])

  return (
    <aside className="sidebar">
      <button className="project-picker" onClick={() => void pickProjectAndConnect()} title="Change project">
        <FolderOpen size={14} />
        <span className="ellipsis">{project ?? 'Choose a project…'}</span>
      </button>
      <div className="sidebar-row">
        <span className="sidebar-label">Sessions</span>
        <button className="icon-btn" onClick={() => void newSession()} title="New session">
          <Plus size={14} />
        </button>
      </div>
      <div className="session-list">
        {sessions.length === 0 && <div className="sidebar-note">No sessions yet for this project.</div>}
        {sessions.map((s) => (
          <div
            key={s.path}
            className={`session-item ${s.path === activeSessionPath ? 'active' : ''}`}
            onClick={() => void switchSession(s.path)}
          >
            {renaming === s.path ? (
              <input
                className="rename-input"
                autoFocus
                value={renameText}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setRenameText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void useAppStore.getState().renameSession(renameText)
                    setRenaming(null)
                  }
                  if (e.key === 'Escape') setRenaming(null)
                }}
                onBlur={() => setRenaming(null)}
              />
            ) : (
              <span
                className="ellipsis session-title"
                onDoubleClick={() => {
                  setRenaming(s.path)
                  setRenameText(s.title)
                }}
                title={s.title}
              >
                {s.title}
              </span>
            )}
          </div>
        ))}
      </div>
    </aside>
  )
}
```

Append sidebar styles:

```css
.sidebar-row { display: flex; align-items: center; justify-content: space-between; }
.sidebar-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-dim); }
.icon-btn { background: none; border: none; color: var(--text-dim); cursor: pointer; padding: 4px; border-radius: 6px; }
.icon-btn:hover { background: var(--bg-hover); color: var(--text); }
.session-list { display: flex; flex-direction: column; gap: 2px; overflow-y: auto; }
.session-item { padding: 8px 10px; border-radius: 8px; cursor: pointer; font-size: 13px; border: 1px solid transparent; }
.session-item:hover { background: var(--bg-hover); }
.session-item.active { background: var(--accent-soft); border-color: rgba(79, 156, 249, 0.4); }
.session-title { display: block; }
.ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rename-input { width: 100%; background: var(--bg); color: var(--text); border: 1px solid var(--accent); border-radius: 6px; padding: 4px 6px; font: inherit; }
.project-picker { display: flex; align-items: center; gap: 8px; }
```

- [ ] **Step 8: Full test + build + stage**

Run: `cd oh-my-pi-desktop && npx vitest run && npm run build`
Expected: all tests PASS, build exits 0.

```bash
git add oh-my-pi-desktop/src/main/session-scanner.ts oh-my-pi-desktop/src/renderer oh-my-pi-desktop/test/session-scanner.test.ts oh-my-pi-desktop/test/history.test.ts && git status --porcelain
```

---

### Task 6: Control — abort/steer/follow-up, model + thinking pickers, fast mode, status polling

**Files:**
- Create: `oh-my-pi-desktop/src/renderer/src/components/TopBar.tsx`
- Modify: `oh-my-pi-desktop/src/renderer/src/components/Composer.tsx` (steer vs follow-up)
- Modify: `oh-my-pi-desktop/src/renderer/src/store.ts` (steer/followUp/refreshState actions, model/thinking setters)
- Modify: `oh-my-pi-desktop/src/renderer/src/App.tsx` (mount TopBar)

**Interfaces:**
- Consumes: `api.steer`, `api.followUp`, `api.getState`, `api.getModels`, `api.setModel`, `api.setThinkingLevel`, `api.setFastMode` (all wired in Task 3).
- Produces: store actions `steer(text)`, `followUp(text)`, `refreshState()`, `setModel(provider, id)`, `setThinkingLevel(level)`, `setFastMode(enabled)`; `TopBar` component.

- [ ] **Step 1: Store actions**

Add to `oh-my-pi-desktop/src/renderer/src/store.ts` state: `models: { provider: string; id: string }[]`, `fastMode: boolean`, `nextCursor: string | null` (already added in Task 5), and actions:

```ts
  steer: async (text) => {
    try {
      await api.steer(text.trim())
    } catch (e) {
      get().toast(`Steer failed: ${(e as Error).message}`, 'error')
    }
  },

  followUp: async (text) => {
    try {
      await api.followUp(text.trim())
    } catch (e) {
      get().toast(`Follow-up failed: ${(e as Error).message}`, 'error')
    }
  },

  refreshState: async () => {
    try {
      const st = (await api.getState()) as {
        model?: { provider: string; id: string }
        thinkingLevel?: string
        isStreaming?: boolean
        messageCount?: number
        contextUsage?: { tokens: number; contextWindow: number; percent: number }
        tokensPerSecond?: number | null
        fastModeEnabled?: boolean
        fastModeActive?: boolean
        sessionName?: string
      }
      set({
        model: st.model ?? null,
        thinkingLevel: st.thinkingLevel ?? get().thinkingLevel,
        isStreaming: st.isStreaming ?? get().isStreaming,
        contextUsage: st.contextUsage ?? null,
        tokensPerSecond: st.tokensPerSecond ?? null,
        fastMode: st.fastModeEnabled ?? st.fastModeActive ?? false,
        sessionName: st.sessionName ?? get().sessionName
      })
    } catch {
      /* not connected yet — ignore */
    }
  },

  setModel: async (provider, id) => {
    try {
      await api.setModel(provider, id)
      set({ model: { provider, id } })
    } catch (e) {
      get().toast(`Model change failed: ${(e as Error).message}`, 'error')
    }
  },

  setThinkingLevel: async (level) => {
    try {
      await api.setThinkingLevel(level)
      set({ thinkingLevel: level })
    } catch (e) {
      get().toast(`Thinking level failed: ${(e as Error).message}`, 'error')
    }
  },

  setFastMode: async (enabled) => {
    try {
      await api.setFastMode(enabled)
      set({ fastMode: enabled })
    } catch (e) {
      get().toast(`Fast mode failed: ${(e as Error).message}`, 'error')
    }
  },
```

Wire status transitions to refresh state: in the module-level `api.onStatus` handler add `if (status === 'connected') void useAppStore.getState().refreshState()`.

- [ ] **Step 2: Composer steer/follow-up**

Modify `Composer.tsx`:

- While streaming, the send button becomes a split control: an interrupt-send (`steer`) and a queue-send (`followUp`).
- Replace the submit handler:

```tsx
  const steer = useAppStore((s) => s.steer)
  const followUp = useAppStore((s) => s.followUp)

  const submitStreaming = (mode: 'steer' | 'followUp'): void => {
    if (!text.trim()) return
    void (mode === 'steer' ? steer(text) : followUp(text))
    setText('')
  }
```

- And in the JSX, when `isStreaming`, render:

```tsx
      {isStreaming ? (
        <div className="composer-actions">
          <button type="button" className="btn" onClick={() => submitStreaming('followUp')} title="Queue follow-up (sends after this turn)">
            Queue
          </button>
          <button type="button" className="btn danger" onClick={() => submitStreaming('steer')} title="Interrupt and send now">
            Interrupt
          </button>
          <button type="button" className="btn danger" onClick={() => void abort()} title="Abort turn">
            <Square size={16} />
          </button>
        </div>
      ) : (
        <button type="submit" className="btn primary" disabled={!text.trim()} title="Send">
          <Send size={16} />
        </button>
      )}
```

Add CSS:

```css
.composer-actions { display: flex; gap: 6px; }
```

- [ ] **Step 3: TopBar**

Write `oh-my-pi-desktop/src/renderer/src/components/TopBar.tsx`:

```tsx
import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import { RefreshCw, Zap, ZapOff } from 'lucide-react'

const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

export function TopBar(): React.JSX.Element {
  const model = useAppStore((s) => s.model)
  const thinkingLevel = useAppStore((s) => s.thinkingLevel)
  const fastMode = useAppStore((s) => s.fastMode)
  const setModel = useAppStore((s) => s.setModel)
  const setThinkingLevel = useAppStore((s) => s.setThinkingLevel)
  const setFastMode = useAppStore((s) => s.setFastMode)
  const [models, setModels] = useState<{ provider: string; id: string }[]>([])

  useEffect(() => {
    void (async () => {
      try {
        const data = (await window.omp.getModels()) as { models?: { provider: string; id: string }[]; data?: unknown }
        const list = Array.isArray(data.models) ? data.models : Array.isArray(data) ? data : []
        setModels(list)
      } catch {
        /* not connected */
      }
    })()
  }, [model])

  return (
    <header className="topbar">
      <div className="topbar-title">
        <h1>Oh My Pi Desktop</h1>
      </div>
      <div className="topbar-controls">
        <select
          value={model ? `${model.provider}/${model.id}` : ''}
          onChange={(e) => {
            const [provider, ...rest] = e.target.value.split('/')
            void setModel(provider, rest.join('/'))
          }}
        >
          <option value="" disabled>
            {model ? `${model.provider}/${model.id}` : 'Model…'}
          </option>
          {models.map((m) => (
            <option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
              {m.provider}/{m.id}
            </option>
          ))}
        </select>
        <select
          value={thinkingLevel}
          onChange={(e) => void setThinkingLevel(e.target.value)}
          title="Thinking level"
        >
          {THINKING_LEVELS.map((l) => (
            <option key={l} value={l}>
              think: {l}
            </option>
          ))}
        </select>
        <button
          className={`icon-btn ${fastMode ? 'on' : ''}`}
          title={fastMode ? 'Fast mode on' : 'Fast mode off'}
          onClick={() => void setFastMode(!fastMode)}
        >
          {fastMode ? <Zap size={14} /> : <ZapOff size={14} />}
        </button>
        <button className="icon-btn" title="Refresh state" onClick={() => void useAppStore.getState().refreshState()}>
          <RefreshCw size={14} />
        </button>
      </div>
    </header>
  )
}
```

Mount `<TopBar />` in `App.tsx` at the top of the `.app` div (replace the old header) and delete the old `<header className="app-header">` block. Add styles:

```css
.topbar { display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; border-bottom: 1px solid var(--border); background: var(--bg-raised); }
.topbar-title h1 { font-size: 15px; margin: 0; }
.topbar-controls { display: flex; align-items: center; gap: 8px; }
.topbar select { background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px; font: inherit; font-size: 12px; }
.icon-btn.on { color: var(--warn); }
```

- [ ] **Step 4: Verify + stage**

Run: `cd oh-my-pi-desktop && npm run build && npx vitest run`
Expected: all tests PASS, build exits 0.

```bash
git add oh-my-pi-desktop/src/renderer && git status --porcelain
```

---

### Task 7: Dialogs — extension_ui_request modals

**Files:**
- Rewrite: `oh-my-pi-desktop/src/renderer/src/components/UiRequestModal.tsx`
- Modify: `oh-my-pi-desktop/src/renderer/src/store.ts` (uiRequest payload typing)

**Interfaces:**
- Consumes: `api.uiResponse(id, value, confirmed?, cancelled?)` (Task 3), `uiRequest` state (Task 4).
- Produces: full modal handling for `confirm`, `select`, `input`, `editor`, `notify`, honoring `timeout`.

- [ ] **Step 1: Modal component**

Rewrite `oh-my-pi-desktop/src/renderer/src/components/UiRequestModal.tsx`:

```tsx
import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store'

interface UiRequest {
  id: string
  method: 'confirm' | 'select' | 'input' | 'editor' | 'notify' | string
  title?: string
  message?: string
  placeholder?: string
  options?: Array<string | { label: string; value: string }>
  timeout?: number
  defaultValue?: string
  content?: string
}

export function UiRequestModal(): React.JSX.Element | null {
  const req = useAppStore((s) => s.uiRequest) as UiRequest | null
  const answerUi = useAppStore((s) => s.answerUi)
  const [value, setValue] = useState('')
  const [selected, setSelected] = useState('')

  useEffect(() => {
    if (!req) return
    setValue(req.defaultValue ?? req.content ?? '')
    const first = Array.isArray(req.options) ? req.options[0] : undefined
    setSelected(typeof first === 'string' ? first : first?.value ?? '')
    if (req.method === 'notify' && typeof req.timeout === 'number') {
      const t = setTimeout(() => void answerUi(req.id, undefined, undefined, true), req.timeout)
      return () => clearTimeout(t)
    }
  }, [req, answerUi])

  if (!req) return null

  const opts = Array.isArray(req.options)
    ? req.options.map((o) => (typeof o === 'string' ? { label: o, value: o } : o))
    : []

  const close = (cancelled: boolean): void => {
    void answerUi(req.id, value, !cancelled, cancelled)
  }

  return (
    <div className="modal">
      <div className="modal-box">
        <h2>{req.title ?? 'Oh My Pi'}</h2>
        {req.message && <p className="modal-message">{req.message}</p>}
        {req.method === 'confirm' && (
          <div className="modal-actions">
            <button className="btn" onClick={() => close(true)}>
              Cancel
            </button>
            <button className="btn primary" onClick={() => close(false)}>
              OK
            </button>
          </div>
        )}
        {req.method === 'input' && (
          <>
            <input
              className="modal-input"
              autoFocus
              value={value}
              placeholder={req.placeholder ?? ''}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && close(false)}
            />
            <div className="modal-actions">
              <button className="btn" onClick={() => close(true)}>
                Cancel
              </button>
              <button className="btn primary" onClick={() => close(false)}>
                OK
              </button>
            </div>
          </>
        )}
        {req.method === 'editor' && (
          <>
            <textarea
              className="modal-editor"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <div className="modal-actions">
              <button className="btn" onClick={() => close(true)}>
                Cancel
              </button>
              <button className="btn primary" onClick={() => close(false)}>
                Save
              </button>
            </div>
          </>
        )}
        {req.method === 'select' && (
          <>
            <div className="modal-options">
              {opts.map((o) => (
                <button
                  key={o.value}
                  className={`option ${selected === o.value ? 'selected' : ''}`}
                  onClick={() => {
                    setSelected(o.value)
                    void answerUi(req.id, o.value, true)
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => close(true)}>
                Cancel
              </button>
            </div>
          </>
        )}
        {req.method === 'notify' && (
          <div className="modal-actions">
            <button className="btn primary" onClick={() => close(false)}>
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Store cleanup**

In `store.ts` `answerUi`, only clear `uiRequest` after the response is sent (already ordered). Ensure `uiRequest` resets on abort:

```ts
  answerUi: async (id, value, confirmed, cancelled) => {
    try {
      await api.uiResponse(id, value, confirmed, cancelled)
    } catch (e) {
      get().toast(`UI response failed: ${(e as Error).message}`, 'error')
    } finally {
      set({ uiRequest: null })
    }
  },
```

- [ ] **Step 3: Styles**

```css
.modal-box { background: var(--bg-raised); border: 1px solid var(--border); border-radius: 12px; padding: 20px; width: 480px; max-width: 90vw; }
.modal-box h2 { margin: 0 0 8px; font-size: 15px; }
.modal-message { color: var(--text-dim); margin: 0 0 12px; white-space: pre-wrap; }
.modal-input, .modal-editor { width: 100%; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; font: inherit; }
.modal-editor { min-height: 160px; resize: vertical; font-family: Consolas, monospace; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.modal-options { display: flex; flex-direction: column; gap: 6px; }
.option { text-align: left; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; cursor: pointer; }
.option.selected { border-color: var(--accent); background: var(--accent-soft); }
```

- [ ] **Step 4: Verify + stage**

Run: `cd oh-my-pi-desktop && npm run build && npx vitest run`
Expected: all tests PASS, build exits 0.

```bash
git add oh-my-pi-desktop/src/renderer/src/components/UiRequestModal.tsx oh-my-pi-desktop/src/renderer/src/store.ts && git status --porcelain
```

---

### Task 8: Todos panel

**Files:**
- Create: `oh-my-pi-desktop/src/renderer/src/components/TodoPanel.tsx`
- Modify: `oh-my-pi-desktop/src/renderer/src/components/Sidebar.tsx` (mount panel)
- Modify: `oh-my-pi-desktop/src/renderer/src/store.ts` (todos state + event handling)

**Interfaces:**
- Consumes: `todo_reminder` / `todo_auto_clear` agent events.
- Produces: `todos: TodoPhase[]` state; `TodoPanel` component.

```ts
export interface TodoTask { id: string; content: string; status: string }
export interface TodoPhase { id: string; name: string; tasks: TodoTask[] }
```

- [ ] **Step 1: Store state + reducer**

In `store.ts`:

- Add `todos: [] as TodoPhase[]` to state.
- Replace the `todo_reminder` stub in the module-level event wiring:

```ts
  if (type === 'todo_reminder' || type === 'todo_auto_clear') {
    const phases = Array.isArray((frame as { phases?: unknown }).phases)
      ? (frame as { phases: TodoPhase[] }).phases
      : Array.isArray((frame as { todos?: unknown }).todos)
        ? (frame as { todos: TodoPhase[] }).todos
        : []
    useAppStore.setState({ todos: phases })
  }
```

- Add to state interface: `todos: TodoPhase[]`.

- [ ] **Step 2: TodoPanel**

Write `oh-my-pi-desktop/src/renderer/src/components/TodoPanel.tsx`:

```tsx
import React from 'react'
import { useAppStore } from '../store'

const STATUS_CLASS: Record<string, string> = {
  pending: 'todo-pending',
  in_progress: 'todo-progress',
  completed: 'todo-done',
  blocked: 'todo-blocked',
  dropped: 'todo-dropped'
}

export function TodoPanel(): React.JSX.Element | null {
  const todos = useAppStore((s) => s.todos)
  if (todos.length === 0) return null
  return (
    <div className="todo-panel">
      <div className="sidebar-label">Todos</div>
      {todos.map((phase) => (
        <div key={phase.id} className="todo-phase">
          <div className="todo-phase-name">{phase.name}</div>
          {phase.tasks.map((t) => (
            <div key={t.id} className={`todo-task ${STATUS_CLASS[t.status] ?? 'todo-pending'}`}>
              <span className="todo-bullet" />
              <span className="ellipsis">{t.content}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
```

Mount `<TodoPanel />` at the bottom of `Sidebar` (after the session list) and add styles:

```css
.todo-panel { margin-top: 12px; border-top: 1px solid var(--border); padding-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.todo-phase-name { font-size: 12px; color: var(--text-dim); margin: 4px 0 2px; }
.todo-task { display: flex; gap: 6px; align-items: baseline; font-size: 12px; color: var(--text); }
.todo-bullet { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
.todo-pending .todo-bullet { background: var(--text-dim); }
.todo-progress .todo-bullet { background: var(--warn); }
.todo-done .todo-bullet { background: var(--ok); }
.todo-blocked .todo-bullet { background: var(--err); }
.todo-dropped .todo-bullet { background: transparent; border: 1px solid var(--text-dim); }
.todo-done { text-decoration: line-through; color: var(--text-dim); }
```

- [ ] **Step 3: Verify + stage**

Run: `cd oh-my-pi-desktop && npm run build && npx vitest run`
Expected: all tests PASS, build exits 0.

```bash
git add oh-my-pi-desktop/src/renderer && git status --porcelain
```

---

### Task 9: Error surfaces — onboarding, project memory, crash recovery, empty states

**Files:**
- Create: `oh-my-pi-desktop/src/main/session-store.ts`
- Create: `oh-my-pi-desktop/src/main/omp-detect.ts`
- Modify: `oh-my-pi-desktop/src/main/index.ts`
- Modify: `oh-my-pi-desktop/src/renderer/src/App.tsx` (onboarding view)
- Create: `oh-my-pi-desktop/src/renderer/src/components/Onboarding.tsx`
- Create: `oh-my-pi-desktop/test/session-store.test.ts`

**Interfaces:**
- Consumes: `app.getPath('userData')`, `app.getPath('home')`.
- Produces: `rememberProject(cwd)` / `recallProject()` / `clearProject()`; `findOmp(): Promise<string | null>` (checks `omp` on PATH, then `C:\Users\dylan\.bun\bin\omp.exe`, then common install dirs); onboarding flow; crash banner via status (`reconnecting` already surfaces in StatusBar).

- [ ] **Step 1: Session-store tests**

Write `oh-my-pi-desktop/test/session-store.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ProjectMemory } from '../src/main/session-store'

describe('ProjectMemory', () => {
  it('remembers, recalls, and clears the project', () => {
    const dir = mkdtempSync(join(tmpdir(), 'omp-mem-'))
    const mem = new ProjectMemory(dir)
    expect(mem.recall()).toBeNull()
    mem.remember('C:\\Users\\dylan\\downloads\\claude')
    expect(mem.recall()).toBe('C:\\Users\\dylan\\downloads\\claude')
    mem.clear()
    expect(mem.recall()).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/session-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write session-store + omp-detect**

Write `oh-my-pi-desktop/src/main/session-store.ts` (pure Node — no `electron` import):

```ts
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

export class ProjectMemory {
  private file: string
  constructor(baseDir: string) {
    this.file = join(baseDir, 'project.json')
  }
  recall(): string | null {
    try {
      if (!existsSync(this.file)) return null
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as { cwd?: unknown }
      return typeof raw.cwd === 'string' && raw.cwd ? raw.cwd : null
    } catch {
      return null
    }
  }
  remember(cwd: string): void {
    mkdirSync(join(this.file, '..'), { recursive: true })
    writeFileSync(this.file, JSON.stringify({ cwd }, null, 2), 'utf8')
  }
  clear(): void {
    try {
      rmSync(this.file, { force: true })
    } catch {
      /* ignore */
    }
  }
}
```

Write `oh-my-pi-desktop/src/main/omp-detect.ts`:

```ts
import { accessSync, constants } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { spawnSync } from 'child_process'

const CANDIDATES = [
  'omp',
  join(homedir(), '.bun', 'bin', 'omp.exe'),
  join(homedir(), '.local', 'bin', 'omp'),
  'C:\\Program Files\\Oh My Pi\\omp.exe'
]

export function findOmp(): string | null {
  for (const candidate of CANDIDATES) {
    try {
      const res = spawnSync(candidate, ['--version'], { stdio: 'ignore', timeout: 5000, windowsHide: true })
      if (res.status === 0) return candidate
    } catch {
      /* try next */
    }
    if (candidate !== 'omp') {
      try {
        accessSync(candidate, constants.X_OK)
        return candidate
      } catch {
        /* not present */
      }
    }
  }
  return null
}
```

- [ ] **Step 4: Run store tests**

Run: `npx vitest run test/session-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire main + onboarding**

Modify `oh-my-pi-desktop/src/main/index.ts`:

- Import `ProjectMemory`, `findOmp`; construct `const memory = new ProjectMemory(app.getPath('userData'))` in `whenReady`.
- Detect omp at startup: `const ompPath = findOmp() ?? 'omp'`; pass to `AgentHost`.
- Add IPC `omp:recall_project` → `memory.recall()` and `omp:remember_project` → `memory.remember(cwd)` and `omp:omp_path` → resolved path.
- Expose them via preload:

```ts
  recallProject: () => ipcRenderer.invoke('omp:recall_project'),
  rememberProject: (cwd) => ipcRenderer.invoke('omp:remember_project', cwd),
  getOmpPath: () => ipcRenderer.invoke('omp:omp_path'),
```

and add to `OmpApi` interface + `api.ts` renderer wrapper.

Write `oh-my-pi-desktop/src/renderer/src/components/Onboarding.tsx`:

```tsx
import React from 'react'
import { useAppStore } from '../store'
import { FolderOpen } from 'lucide-react'

export function Onboarding(): React.JSX.Element {
  const pickProjectAndConnect = useAppStore((s) => s.pickProjectAndConnect)
  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <h2>Welcome to Oh My Pi Desktop</h2>
        <p>Choose a project directory. The app runs the Oh My Pi coding agent there and shows its work here.</p>
        <button className="btn primary" onClick={() => void pickProjectAndConnect()}>
          <FolderOpen size={16} /> Choose project…
        </button>
      </div>
    </div>
  )
}
```

Modify `App.tsx`:

- On mount, recall the project; if present, auto-connect; else show `<Onboarding />` instead of the chat when `project === null && !picked`:

```tsx
  const project = useAppStore((s) => s.project)
  const status = useAppStore((s) => s.status)
  useEffect(() => {
    void (async () => {
      const remembered = await window.omp.recallProject()
      if (remembered) {
        await useAppStore.getState().connect(remembered)
      }
    })()
  }, [])
```

- Replace the `onboarding-hint` div: render `<Onboarding />` when `project === null` and status is `offline`; otherwise the normal layout. Keep the full layout always mounted but overlay onboarding as a modal-style screen:

```tsx
      {project === null && status === 'offline' && <Onboarding />}
```

- After a successful `connect` in the store, call `window.omp.rememberProject(project)`.

Onboarding styles:

```css
.onboarding { position: fixed; inset: 0; background: var(--bg); display: flex; align-items: center; justify-content: center; z-index: 60; }
.onboarding-card { text-align: center; max-width: 420px; padding: 40px; border: 1px solid var(--border); border-radius: 16px; background: var(--bg-raised); }
.onboarding-card h2 { margin: 0 0 10px; }
.onboarding-card p { color: var(--text-dim); margin: 0 0 20px; }
```

- [ ] **Step 6: Crash recovery note**

Crash recovery is already implemented in `AgentHost.handleExit()` (Task 3): exit → `reconnecting` → respawn same project → `connected`. The StatusBar shows the state. Add one enhancement in `store.ts` — when status returns to `connected` after a `reconnecting` stretch, toast "Reconnected to agent":

```ts
let wasReconnecting = false
api.onStatus((status) => {
  if (status === 'reconnecting') wasReconnecting = true
  if (status === 'connected' && wasReconnecting) {
    wasReconnecting = false
    useAppStore.getState().toast('Reconnected to the agent')
  }
  useAppStore.setState({ status })
  if (status === 'connected') void useAppStore.getState().refreshState()
})
```

- [ ] **Step 7: Full verification**

Run: `cd oh-my-pi-desktop && npx vitest run && npm run build`
Expected: all tests PASS (rpc 5, agent-host 2, transcript 3, scanner 4, history 1, session-store 1), build exits 0.

Run: `npm run dev` briefly.
Expected: onboarding screen appears on first run (no remembered project); choosing a directory connects and renders the chat shell.

- [ ] **Step 8: Stage**

```bash
git add oh-my-pi-desktop/src/main/session-store.ts oh-my-pi-desktop/src/main/omp-detect.ts oh-my-pi-desktop/src/main/index.ts oh-my-pi-desktop/src/renderer oh-my-pi-desktop/test/session-store.test.ts && git status --porcelain
```

---

### Task 10: Icon + Windows packaging

**Files:**
- Create: `oh-my-pi-desktop/scripts/gen-icon.mjs`
- Create: `oh-my-pi-desktop/build/icon.svg`
- Modify: `oh-my-pi-desktop/package.json` (electron-builder config)
- Create: `oh-my-pi-desktop/build/entitlements.mac.plist` — **skip, Windows only**

**Interfaces:**
- Consumes: Task 1–9 app.
- Produces: `dist/Oh My Pi Desktop Setup 0.1.0.exe` (NSIS installer), `dist/win-unpacked/` (portable folder).

- [ ] **Step 1: Icon generator**

Write `oh-my-pi-desktop/scripts/gen-icon.mjs`:

```js
import sharp from 'sharp'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'build', 'icon.svg'), 'utf8')

// 1024 master → all sizes electron-builder wants
await sharp(Buffer.from(svg)).resize(1024, 1024).png().toFile(join(root, 'build', 'icon.png'))
await sharp(Buffer.from(svg)).resize(256, 256).png().toFile(join(root, 'build', 'icon-256.png'))
await sharp(Buffer.from(svg)).resize(64, 64).png().toFile(join(root, 'build', 'icon-64.png'))
console.log('icons written')
```

Write `oh-my-pi-desktop/build/icon.svg` — rounded-square dark tile, terminal-green prompt, raspberry π:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1c2333"/>
      <stop offset="1" stop-color="#0f1115"/>
    </linearGradient>
  </defs>
  <rect x="32" y="32" width="960" height="960" rx="200" fill="url(#bg)"/>
  <rect x="32" y="32" width="960" height="960" rx="200" fill="none" stroke="#2a2f3a" stroke-width="12"/>
  <text x="512" y="620" font-family="Consolas, 'Courier New', monospace" font-size="430" font-weight="700" fill="#3fb950" text-anchor="middle">π</text>
  <path d="M300 760 h300" stroke="#4f9cf9" stroke-width="36" stroke-linecap="round"/>
  <rect x="300" y="718" width="36" height="84" rx="12" fill="#4f9cf9"/>
</svg>
```

Run: `node scripts/gen-icon.mjs`
Expected: `build/icon.png` (1024²) written.

- [ ] **Step 2: electron-builder config**

Add to `oh-my-pi-desktop/package.json`:

```json
  "build": {
    "appId": "com.ohmy.pi.desktop",
    "productName": "Oh My Pi Desktop",
    "directories": { "output": "dist" },
    "files": ["out/**"],
    "win": {
      "icon": "build/icon.png",
      "target": [{ "target": "nsis", "arch": ["x64"] }]
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "perMachine": false,
      "createDesktopShortcut": true,
      "shortcutName": "Oh My Pi Desktop"
    }
  }
```

- [ ] **Step 3: Build the installer**

Run: `cd oh-my-pi-desktop && npm run dist`
Expected (this takes several minutes on first run):
- `dist/win-unpacked/Oh My Pi Desktop.exe` exists
- `dist/Oh My Pi Desktop Setup 0.1.0.exe` exists (~80–150 MB)

- [ ] **Step 4: Smoke-run the packaged app**

```bash
powershell -Command "Start-Process 'dist/win-unpacked/Oh My Pi Desktop.exe'; Start-Sleep 8; Get-Process 'Oh My Pi Desktop' | Select-Object -Property Id,MainWindowTitle | Format-List"
```

Expected: a process row with a non-empty `MainWindowTitle`.

Then capture a screenshot of the window and verify visually:

```powershell
powershell -Command "Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bmp=New-Object System.Drawing.Bitmap($b.Width,$b.Height); $g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size); $bmp.Save('C:\Users\dylan\downloads\claude\oh-my-pi-desktop\docs\smoke-onboarding.png'); $g.Dispose(); $bmp.Dispose()"
```

Inspect `oh-my-pi-desktop/docs/smoke-onboarding.png` with `inspect_image` — expected: the "Welcome to Oh My Pi Desktop" onboarding card renders cleanly.

Kill the app: `powershell -Command "Stop-Process -Name 'Oh My Pi Desktop' -Force"`.

- [ ] **Step 5: Stage**

```bash
git add oh-my-pi-desktop/scripts oh-my-pi-desktop/build oh-my-pi-desktop/package.json oh-my-pi-desktop/docs && git status --porcelain
```

> `dist/` is gitignored — the installer artifact is build output, not tracked. `docs/smoke-onboarding.png` IS tracked (verification artifact).

---

### Task 11: E2E integration against the real omp agent

**Files:**
- Create: `oh-my-pi-desktop/test/e2e-real-omp.test.ts` (integration; skipped unless `RUN_E2E=1`)

**Interfaces:**
- Consumes: `RpcClient` (Task 2) against the real `omp` binary.
- Produces: proof the app's protocol layer works against the real agent: ready → negotiate v2 → prompt → stream → tool call → agent_end → abort.

- [ ] **Step 1: Write the integration test**

Write `oh-my-pi-desktop/test/e2e-real-omp.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { RpcClient } from '../src/main/rpc-client'

const RUN = process.env.RUN_E2E === '1'

describe.skipIf(!RUN)('real omp integration', () => {
  it('streams a real prompt end to end', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'omp-e2e-'))
    const client = new RpcClient({ ompPath: 'omp', cwd, env: { PI_RPC_EMIT_TITLE: '1' } })
    await client.start()
    const types: string[] = []
    let text = ''
    client.on('event', (ev) => {
      types.push(ev.type as string)
      if (ev.type === 'message_update') {
        const ae = ev.assistantMessageEvent as { type?: string; delta?: string }
        if (ae.type === 'text_delta' && typeof ae.delta === 'string') text += ae.delta
      }
    })
    const ack = await client.send({ type: 'prompt', message: 'Reply with exactly the word: OK' })
    expect((ack as { agentInvoked?: boolean }).agentInvoked).toBe(true)
    // Wait for agent_end
    await new Promise<void>((resolve, reject) => {
      const check = (): void => {
        if (types.includes('agent_end')) resolve()
        else setTimeout(check, 200)
      }
      check()
      setTimeout(() => reject(new Error('no agent_end within 120s')), 120_000)
    })
    expect(text).toContain('OK')
    client.stop()
  }, 150_000)

  it('aborts a running turn', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'omp-e2e-'))
    const client = new RpcClient({ ompPath: 'omp', cwd, env: { PI_RPC_EMIT_TITLE: '1' } })
    await client.start()
    const ack = await client.send({ type: 'prompt', message: 'Write a very long essay about chips. Keep going until I stop you.' })
    expect((ack as { agentInvoked?: boolean }).agentInvoked).toBe(true)
    await new Promise((r) => setTimeout(r, 2000))
    await client.send({ type: 'abort' })
    await new Promise((r) => setTimeout(r, 1500))
    // Process must still be alive and responsive
    const state = await client.send({ type: 'get_state' })
    expect(state).toBeTruthy()
    client.stop()
  }, 150_000)
})
```

- [ ] **Step 2: Run the integration test**

Run: `cd oh-my-pi-desktop && RUN_E2E=1 npx vitest run test/e2e-real-omp.test.ts`
Expected: both tests PASS against the real agent. **This is the acceptance proof** that the RPC layer the app is built on works against real omp — streaming text arrives, `agent_end` fires, abort leaves the process responsive.

If no provider is configured, the first test fails at `prompt` ack with an auth error — report the exact error and stop (the app is still correct; the machine needs `omp /login` once).

- [ ] **Step 3: Stage**

```bash
git add oh-my-pi-desktop/test/e2e-real-omp.test.ts && git status --porcelain
```

---

### Task 12: Final review, docs, and cleanup

**Files:**
- Create: `oh-my-pi-desktop/README.md`
- Modify: `oh-my-pi-desktop/.gitignore` (add `docs/smoke-*.png`? No — keep verification artifacts tracked)

**Interfaces:**
- Consumes: everything.
- Produces: repo-clean state, README with run/build instructions, staged working tree.

- [ ] **Step 1: README**

Write `oh-my-pi-desktop/README.md`:

```markdown
# Oh My Pi Desktop

Windows desktop chat client for the Oh My Pi coding agent (`omp`).

## Requirements

- Windows 10/11
- `omp` on PATH (or installed to `~/.bun/bin/omp.exe`)
- Node 22+ and npm for development

## Develop

```bash
npm install
npm run dev          # electron-vite dev server + app window
npm test             # unit tests (mock omp process)
RUN_E2E=1 npm test   # + integration tests against the real omp (needs a configured provider)
```

## Build the installer

```bash
npm run dist
```

Outputs `dist/Oh My Pi Desktop Setup 0.1.0.exe` (NSIS) and `dist/win-unpacked/`.

## Architecture

- `src/main/` — Electron main: `agent-host.ts` (omp process lifecycle + reconnect),
  `rpc-client.ts` (JSONL protocol, v2 chunking, id correlation),
  `session-scanner.ts` (session listing from `~/.omp/agent/sessions`), `ipc.ts`.
- `src/preload/` — typed `window.omp` contextBridge API.
- `src/renderer/` — React UI (chat, tool cards, todos, sessions, dialogs).

The app drives `omp --mode rpc` as a child process; it never touches agent
credentials — auth lives in `omp`'s own store (`~/.omp/agent`).

## Protocol notes

- Spawn: `omp --mode rpc --cwd <project>` with `PI_RPC_EMIT_TITLE=1`.
- Sessions: `~/.omp/agent/sessions/<bucket>/<timestamp>_<sessionId>.jsonl`;
  headers carry `cwd`, which is how the app groups sessions per project.
```

- [ ] **Step 2: Full verification pass**

Run: `cd oh-my-pi-desktop && npm run build && npx vitest run`
Expected: all unit tests PASS, build exits 0.

Run: `node scripts/gen-icon.mjs` (idempotent) and confirm `build/icon.png` exists.

- [ ] **Step 3: Repo hygiene**

```bash
git add oh-my-pi-desktop && cd .. && git status --porcelain
```

Expected: every file under `oh-my-pi-desktop/` staged; nothing untracked remains (per AGENTS.md). Confirm no `node_modules/`, `out/`, or `dist/` appear.

- [ ] **Step 4: Final report**

Report to the user:
- Installer path: `oh-my-pi-desktop/dist/Oh My Pi Desktop Setup 0.1.0.exe` (built in Task 10)
- Portable: `oh-my-pi-desktop/dist/win-unpacked/`
- Unit tests: count + PASS line
- E2E result (Task 11)
- Screenshot artifact: `oh-my-pi-desktop/docs/smoke-onboarding.png`
- What's staged (not committed, per repo convention)

---

## Self-Review

Run this checklist before handing off:

1. **Spec coverage:**
   - Chat composer/streaming/markdown → Task 4 ✅
   - Tool call cards → Task 4 ✅
   - Sessions (picker, list, new/resume/rename, paging) → Tasks 5 + 9 (project memory) ✅
   - Control (abort/steer/follow-up, model, thinking, fast mode) → Task 6 ✅
   - Todos → Task 8 ✅
   - Dialogs (extension_ui_request) → Task 7 ✅
   - Status bar (context usage, tok/s) → Task 4 + 6 ✅
   - Error handling (onboarding, crash recovery, toasts, parse errors) → Tasks 2, 3, 9 ✅
   - Packaging (NSIS installer, icon, portable) → Task 10 ✅
   - E2E smoke against real omp → Task 11 ✅
2. **Placeholder scan:** the only stubs are explicitly temporary (preload ping stub removed in Task 3; session-scanner stub replaced in Task 5; UiRequestModal/Toasts placeholders replaced in Tasks 7/9) — each has a task that removes it. No TBDs.
3. **Type consistency:** `SessionSummary`, `TranscriptMessage`, `ToolCallView`, `OmpApi`, `RpcClient`/`AgentHost` signatures are defined once (Tasks 2/3) and consumed verbatim by later tasks. `loadOlder` is redefined in Task 5 — the Task 4 version is replaced, not duplicated. The `nextCursor` field is added to the store in Task 5 and used by Task 6+.
