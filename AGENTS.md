# AGENTS.md

Guidance for AI coding agents working in this repo. Humans: see
[CONTRIBUTING.md](CONTRIBUTING.md).

## What this is

An Electron + React (electron-vite) desktop client for the `omp` coding agent.
It spawns `omp --mode rpc` as a child process and speaks a newline-delimited
JSON protocol over stdio. It is **not** a terminal wrapper — no PTY, no ANSI.

## Build / test / verify

```bash
npm ci               # install (reproducible; not npm install)
npm run typecheck    # tsc — the REAL gate; build does not typecheck
npm test             # vitest: mock-omp protocol tests + jsdom component tests
npm run build        # electron-vite (esbuild, strips types)
RUN_E2E=1 npm test   # integration vs. a real omp (needs a provider)
```

Always run `npm run typecheck && npm test` before you claim a change is done.
`npm run build` passing is **not** sufficient — esbuild strips types without
checking them.

## Architecture rules (do not violate)

- **Three layers:** `omp` child process (all agent logic) → Electron main
  (`src/main`, owns the process + protocol) → renderer (`src/renderer`, a pure
  projection of events).
- The **renderer has no Node, no filesystem, no agent logic.** `nodeIntegration`
  is off. Anything privileged crosses the `contextBridge` via the typed
  `window.omp` API defined in `src/preload` and `src/shared/omp-api.ts`.
- **Main-process runtime deps must be Node builtins or `electron`.** The packaged
  bundle excludes `node_modules`; CI fails if `out/main` or `out/preload` require
  anything else. If you truly need one, bundle it via
  `externalizeDepsPlugin({ exclude: [...] })` in `electron.vite.config.ts`.

## Where things live

- `src/main/rpc-client.ts` — JSONL framing, id correlation, v2 lossless chunking.
- `src/main/agent-host.ts` — process lifecycle + reconnect/replay on crash.
- `src/main/omp-detect.ts` — per-platform binary discovery.
- `src/main/shell-env.ts` — login-shell PATH resolution (the macOS Finder-launch fix).
- `src/renderer/src/store.ts` — zustand app state; components are thin.
- `test/fixtures/mock-omp.mjs` — the mock agent that emits canned JSONL.

## Conventions

- **Conventional Commits** for messages (`feat:`, `fix:`, `docs:`, `refactor:`,
  `test:`, `chore:`, `build:`, `ci:`).
- **2-space indent, LF, final newline** (`.editorconfig`). TypeScript, no gratuitous `any`.
- Protocol behavior changes go in the mock-`omp` fixture; UI changes get a jsdom test.

## Gotchas

- macOS fires a menu accelerator on both the native menu item and the DOM; the
  application menu is the single source of truth for chords it binds. Don't add
  a duplicate DOM keydown handler for `Cmd+K/N/O/L`.
- A turn is finished on `agent_end` / `prompt_result` / `data.agentInvoked:false`
  — **not** on the immediate `prompt` ack.
- Malformed JSONL is logged and skipped, never fatal. Keep it that way.
