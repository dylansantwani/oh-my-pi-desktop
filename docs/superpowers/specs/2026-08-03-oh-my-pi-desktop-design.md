# Oh My Pi Desktop — Design

**Date:** 2026-08-03
**Status:** Approved by user (2026-08-03)
**Deliverable:** A full desktop executable application (Windows) that is a GUI chat client for the Oh My Pi coding agent (`omp`).

## Context

The Oh My Pi coding agent (`omp`, on PATH as `omp.exe`) ships with an interactive
terminal TUI. Users who want a richer interface have no desktop option. The
harness exposes two documented integration surfaces:

- **RPC mode** (`omp --mode rpc`): newline-delimited JSON protocol over stdio.
  Commands on stdin, responses + agent events on stdout. Framed, id-correlated,
  with a v2 lossless chunking transport. This is the process-isolated surface a
  desktop host should use.
- **SDK** (`@oh-my-pi/pi-coding-agent`, Bun): in-process embedding. Not used
  here — it requires Bun as the embedding runtime and couples the app to the
  harness's internal session lifecycle.

The app therefore drives `omp --mode rpc` as a child process and implements the
RPC client in plain TypeScript (runs under Node in the Electron main process).

## Goal

A polished Windows desktop client where the user can:

- pick a project directory and start/resume Oh My Pi sessions,
- chat with the agent: send prompts, watch streaming responses,
- see tool calls, todos, model state,
- steer/abort mid-turn, switch models and thinking level,
- answer the agent's UI requests (confirm/input/select) as modals,
- survive agent crashes without losing the transcript.

## Non-goals (v1)

- No embedded terminal, no file explorer, no diff viewer, no git panel.
- No multi-session *concurrent* streaming (OMP RPC hosts one active session per
  process; navigation is switch-then-view).
- No code editing of repo files inside the app.
- No host-owned custom tools (`set_host_tools`) or host URI schemes — deferred.
- No macOS/Linux builds — Windows installer only (the harness runs there, and
  the app is built on Windows).
- No auto-updater, no code signing in v1 (electron-builder produces an
  unsigned installer; signing can be added later).

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Renderer (React + Vite, Chromium)                       │
│  Chat transcript · tool-call cards · todos · sessions   │
│  composer · modals · status bar                          │
└───────────────▲─────────────────────────────────────────┘
                │ contextBridge IPC (window.omp, typed)
┌───────────────┴─────────────────────────────────────────┐
│ Electron main (Node)                                    │
│  RPC client (JSONL framing, id correlation, v2 chunks)  │
│  omp process lifecycle · session store · window mgmt    │
└───────────────▲─────────────────────────────────────────┘
                │ stdin/stdout JSONL
┌───────────────┴─────────────────────────────────────────┐
│ omp --mode rpc [--cwd <project>]  (child process)       │
└─────────────────────────────────────────────────────────┘
```

Three layers, one responsibility each:

1. **`omp` child process** — the agent. Owns all agent logic, session files,
   tools, model calls.
2. **Electron main** — owns the child process and the protocol. Implements the
   RPC client (ready frame → negotiate v2 → commands/events), correlates
   responses by `id`, replays history on reconnect, and exposes a typed IPC
   surface to the renderer. No agent policy decisions live here.
3. **Renderer** — pure projection of events. No agent logic, no filesystem
   access, no Node. `nodeIntegration` off; everything goes through
   `contextBridge`.

### Process model

- One `omp --mode rpc` process per app instance, spawned at startup with the
  remembered project directory (first run: onboarding picker).
- One active session at a time. Session switching uses `switch_session`;
  `get_messages_page` loads history incrementally (cursors bound to the
  session; handle `session_busy` / `stale_cursor` by refetching).
- `prompt`/`abort_and_prompt` are acknowledged immediately; completion is
  signaled by `agent_end`, `prompt_result`, or `data.agentInvoked: false`.
  Streaming deltas arrive as `message_update` frames.
- The renderer receives raw event payloads; it batches rendering via
  `requestAnimationFrame` so high-frequency deltas don't jank the UI.
- Host tools: none registered in v1.

## Features

### Sessions

- Project picker (folder dialog) on first run; remembered in `userData` store.
- Sidebar session list: title, message count, last activity; active highlight.
- Actions: new session, resume (open existing `.jsonl`), rename
  (`set_session_name`), export transcript (`export_html`).
- History paging: load the most recent page first, "load older" pagination
  with `get_messages_page` cursors.

### Chat

- Multiline composer: Enter sends, Shift+Enter newline. Disabled while
  streaming unless the message is a steer/follow-up (see Control).
- Assistant text rendered as markdown (GFM) with syntax-highlighted code
  blocks and copy buttons. User messages plain text.
- Thinking/scratchpad content rendered in a collapsible section when present.

### Tool calls

- `tool_execution_start/update/end` → inline cards: tool name, status icon
  (running/ok/error), arguments (pretty-printed JSON, collapsible), result or
  error excerpt. Cards nest in the transcript order.

### Control

- **Abort**: `abort`.
- **Steer**: while streaming, an interrupting message (`steer`); **follow-up**:
  queued post-turn message (`follow_up`, `streamingBehavior`).
- **Model picker**: `get_available_models` → `set_model`.
- **Thinking level**: `get_state` → `set_thinking_level`; cycle control.
- **Fast mode**: toggle via `set_fast_mode`.

### Todos

- `todo_reminder` / `todo_auto_clear` events → phase/task panel with status
  chips, collapsible in the sidebar. Read-only in v1 (no `set_todos`).

### Dialogs

- `extension_ui_request` (`confirm`/`select`/`input`/`editor`/`notify`) →
  renderer modals; answers posted back as `extension_ui_response`. Timeouts
  honored; `notify` and `setStatus` render as toasts/status text.

### Status bar

- Connection state (starting / connected / reconnecting), active model, context
  usage (tokens + %), tokens/sec when available, streaming indicator.

## Error handling

| Failure | Behavior |
|---|---|
| `omp` binary not found | Onboarding screen: PATH detection, manual path input, retry |
| Agent process crash | Banner + auto-restart with same project + session; history replayed via `get_messages_page`; streaming state reset |
| RPC `success: false` | Inline toast with `error` (+ `code` when present); never silent |
| Malformed JSONL | Parse-error frame: log, skip, continue (protocol is recoverable) |
| Frame over v1 ceiling | Negotiated v2 chunking handles reassembly; large history uses paging, not monolithic `get_messages` |
| Stale/session-busy page cursor | Discard partial pages, refetch from current session head |
| omp stdin closed | Treat as shutdown; restart on next user action |

## Testing & verification

- **Unit (RPC client)**: mock omp process = a Node script emitting canned JSONL
  (ready, negotiate, response correlation, deltas, tool events, chunked v2
  frame). Assert framing, id correlation, event forwarding, error paths.
- **Unit (session store)**: project memory + session list cache CRUD.
- **Unit (renderer)**: markdown/tool-card rendering for fixture events.
- **E2E smoke**: build + launch the packaged app against the real `omp`; run a
  real prompt; observe streaming, a tool call, and abort. This is the
  acceptance proof.

## Packaging

- electron-builder, NSIS per-user installer → `dist/` .exe.
- Product name "Oh My Pi Desktop", appId `com.ohmy.pi.desktop`.
- App icon generated (512px source → ICO/PNG set) and wired into
  build config + window.
- Unpacked portable folder as a secondary artifact.

## Open item (resolve during implementation)

- Exact CLI flag for the working directory in `omp --mode rpc` (docs say
  "regular CLI options"). Check `omp --help`; likely `--cwd`/`--project`/
  positional. The RPC client takes the resolved flag as a constant.

## Layout

```
oh-my-pi-desktop/
├── package.json
├── electron/            # main-process code (compiled with tsup/esbuild)
│   ├── main.ts          # app lifecycle, window, omp spawn, IPC wiring
│   ├── rpc-client.ts    # JSONL framing, v2 negotiation, id correlation
│   ├── session-store.ts # userData-backed project + session memory
│   └── preload.ts       # contextBridge API
├── src/                 # React renderer
│   ├── App.tsx
│   ├── components/      # ChatMessage, ToolCallCard, TodoPanel,
│   │                    # SessionList, ModelPicker, StatusBar, Composer,
│   │                    # UiRequestModal, Onboarding, Toast
│   ├── hooks/           # useAgentEvents, useSessions, useRpcState
│   └── styles/
├── build/               # icons, installer resources
├── test/                # mock-omp fixture script + unit tests
└── docs/
```

## Milestones

1. Scaffold: Vite + React + TS + Electron + electron-builder, base window shell.
2. RPC client + IPC bridge; spawn omp, ready handshake, negotiate v2.
3. Chat: composer, streaming markdown, tool-call cards.
4. Sessions: project picker, list/resume/new/rename, history paging.
5. Control: abort/steer/follow-up, model + thinking pickers, fast mode, todos.
6. Dialogs: extension UI request modals.
7. Polish + error surfaces: onboarding, crash recovery, toasts, status bar.
8. Packaging: icon, NSIS installer, portable folder.
9. E2E smoke against real omp; unit tests green.
