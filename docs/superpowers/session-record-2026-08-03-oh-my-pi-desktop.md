# Oh My Pi Desktop — Execution Record (2026-08-03)

**Status:** Implementation complete, all 12 tasks done, unit + E2E verified,
installer built. Final whole-branch review was **interrupted** by a user
redirect to commit + push (see "Carried-forward findings" for the triage list
that review was asked to settle).

**Deliverable:** Windows desktop chat client for the Oh My Pi coding agent
(`omp`) — directory `oh-my-pi-desktop/` in this repo.

---

## What was built

A chat-style Electron client that drives the real `omp` agent over its RPC
protocol (`omp --mode rpc --cwd <project>`, newline-delimited JSON over stdio):

- **Main process (Electron/Node, TypeScript):**
  - `src/main/rpc-client.ts` — RPC protocol client: v2 negotiation, `rpc_chunk`
    reassembly with sequence validation, id-correlated responses, write-chain
    backpressure, `PI_RPC_EMIT_TITLE=1` env default, SIGTERM→SIGKILL stop.
  - `src/main/agent-host.ts` — omp process lifecycle + auto-reconnect (exit →
    reconnecting → respawn same project), event/UI-request/status listeners.
  - `src/main/ipc.ts` — `omp:*` ipcMain.handle surface (20 invoke + 3 send
    channels, parity-verified against the preload).
  - `src/main/session-scanner.ts` — lists sessions from
    `~/.omp/agent/sessions/<bucket>/<timestamp>_<sessionId>.jsonl`, parses the
    JSONL header (`type:"session"`, `cwd`, `title`), strips the 256-byte title
    slot when present, filters by cwd (case-insensitive, Windows), sorts by
    mtime. Pure Node.
  - `src/main/session-store.ts` — `ProjectMemory` (recall/remember/clear of the
    project cwd in `userData/project.json`). Pure Node.
  - `src/main/omp-detect.ts` — `findOmp()`: PATH `omp`, then
    `~/.bun/bin/omp.exe`, `~/.local/bin/omp`, Program Files.
  - `src/preload/index.ts` + `src/shared/omp-api.ts` — typed `window.omp`
    contextBridge (sandbox:true, no nodeIntegration).
- **Renderer (React + zustand):** streaming markdown chat (react-markdown +
  GFM + highlight.js), tool-call cards (running/ok/error), todos panel from
  `todo_reminder` events, session sidebar (new/resume/rename with click-vs-
  double-click debounce), paged history (`get_messages_page` cursors), model +
  thinking-level pickers, fast-mode toggle, steer/follow-up/abort composer
  controls, extension-UI dialogs (confirm/select/input/editor/notify),
  onboarding (first run) + project recall + crash-recovery toast, status bar
  (connection, model, context usage, tok/s).
- **Packaging:** electron-builder NSIS per-user installer, productName
  "Oh My Pi Desktop", appId `com.ohmy.pi.desktop`, generated π-themed icon
  (`build/icon.svg` → sharp PNGs). `dist/` is gitignored build output.

## Verification evidence

- **Unit tests: 17 passed / 2 skipped** (`npx vitest run`; the 2 skipped are
  the E2E file gated by `RUN_E2E=1`): rpc-client 6, agent-host 2,
  transcript 3, session-scanner 4, history 1, session-store 1. Deterministic:
  mock-omp fixture (`test/fixtures/mock-omp.mjs`) + temp dirs.
- **E2E against the REAL `omp` 17.2.6: 2/2 passed** (`RUN_E2E=1 npx vitest run
  test/e2e-real-omp.test.ts`): streaming prompt returns text "OK" with
  `agent_end` firing; abort leaves the process alive and `get_state`
  responsive.
- **Build:** `npm run build` exit 0 (electron-vite, main/preload/renderer);
  `tsc -p tsconfig.node.json --noEmit` and web project clean.
- **Packaged app smoke:** `dist/Oh My Pi Desktop Setup 0.1.0.exe` (98.16 MB)
  + `dist/win-unpacked/Oh My Pi Desktop.exe`; launched, process title
  "Oh My Pi Desktop", screenshot `oh-my-pi-desktop/docs/smoke-onboarding.png`
  pixel-verified (2560×1440, 21.2% non-black — rendered dark UI, not blank;
  no vision model was available for visual sign-off).
- **Dev smoke (real omp):** streaming "Hello." with a Thinking block,
  multi-turn messages, tool cards; onboarding (first run) and recall
  auto-connect (real `omp --mode rpc --cwd` child) both exercised.

## Environment notes / deviations (approved)

- Node 22.11.0 < electron engines (≥22.12.0): EBADENGINE warnings; electron
  postinstall needed `npx -y node@22.12.0 node_modules/electron/install.js`
  once on this machine.
- `typescript@latest` resolved to 7.0.2 (native port).
- vite@8 is incompatible with electron-vite@5 — pinned vite@^7.3.6 +
  @vitejs/plugin-react@^5.2.0.
- electron-builder 26.15.3 upstream bug (ESM-only `@noble/hashes` 2.x required
  via require) — fixed with npm `overrides` pinning `@noble/hashes` 1.8.0.
- Preload forced to CJS output (`rollupOptions.output: {format:'cjs',
  entryFileNames:'[name].js'}`) because sandboxed preloads can't be ESM.
- `test/**/*.ts` excluded from tsconfig.node.json (vitest transpiles tests;
  production code typechecks clean).

## Carried-forward findings — RESOLVED (2026-08-03, v1.1 fix pass)

The interrupted final-review triage was completed in a follow-up pass; all 8
findings are fixed and verified (17/17 unit tests, both tsconfig typechecks,
`npm run build`, dev-mode boot smoke):

1. **Negotiate-failure handling** — rpc-client.ts: a failed
   `negotiate_protocol` response now keeps `v2=false`, emits an `error` event
   ("v2 negotiation rejected"), and still resolves ready (v1 fallback —
   `rpc_chunk` frames are reassembled regardless). New unit test
   `test/rpc-client.test.ts` ("falls back to v1 … when v2 negotiation is
   rejected") via mock env `MOCK_NEGOTIATE_FAIL=1`.
2. **Transcript recovery hint** — Transcript.tsx shows a debounced (1.2 s)
   "agent didn't reply" hint when the last message is an unanswered user
   bubble, so a rejected prompt is never silent. Debounce avoids flashing on
   the normal send→`agent_start` gap.
3. **Dead type field** — removed `isStreaming?: boolean` from the
   `refreshState` destructure type (store.ts).
4. **`rememberProject` rejection** — `connect()` now `.catch()`es and toasts
   instead of fire-and-forget (store.ts).
5. **Enter-while-streaming** — Composer routes Enter to `followUp` (queue)
   while the agent is mid-turn instead of a `prompt` that gets rejected; the
   explicit Interrupt button still interrupts.
6. **`die` removed from `RpcOutbound`** — mock-only command no longer pollutes
   the production protocol union; the agent-host reconnect test drives it via
   `client.sendRaw({ type: 'die' })` and the mock now exits without a stray
   response frame.
7. **`omp:remember_project` validation** — IPC handler ignores non-string /
   empty `cwd` instead of writing a malformed `project.json` (ipc.ts).
8. **`clearProject` dead surface** — removed the unused `ProjectMemory.clear()`
   method (and its test assertion); remember/recall remain.

## Build / run instructions

See `oh-my-pi-desktop/README.md`:
`npm install && npm run dev` (dev), `npm test` (16/2),
`RUN_E2E=1 npm test` (needs a configured omp provider), `npm run dist`
(installer → `dist/Oh My Pi Desktop Setup 0.1.0.exe`).

## Process record

- Built via superpowers brainstorming → spec
  (`oh-my-pi-desktop/docs/superpowers/specs/2026-08-03-oh-my-pi-desktop-design.md`) → plan
  (`oh-my-pi-desktop/docs/superpowers/plans/2026-08-03-oh-my-pi-desktop.md`) → subagent-driven
  execution (fresh implementer per task, reviewer per task, fixes on findings).
- Development happened in an isolated git worktree
  (`C:\Users\dylan\Downloads\claude-omp-desktop`, branch `omp-desktop`,
  stage-only per repo convention — the branch has ZERO commits; the work was
  synced into this repo's working tree on 2026-08-03 and committed here).
- Per-task briefs/reports/ledger live in the worktree's git-ignored
  `.superpowers/sdd/` (task-*-brief.md, task-*-report.md, progress.md) — not
  committed. This file is the durable record.
- 2026-08-03: user redirected mid-final-review → commit everything in this
  repo and push to origin (github.com/dylansantwani/claude).

## Next steps (suggested)

- Done: the 8 carried-forward findings were triaged and fixed in the v1.1 fix
  pass (see "Carried-forward findings — RESOLVED" above); Enter-while-streaming
  and negotiate-failure handling shipped in that pass.
- Optional: clean up the worktree (`git worktree remove
  ../claude-omp-desktop`, `git branch -d omp-desktop`) once the sync is
  confirmed committed here.
- Remaining v1.1 candidates: code signing (SmartScreen), auto-updater
  (electron-updater + a release feed), and a component-test harness (jsdom +
  @testing-library/react) so renderer logic like the recovery hint and
  Enter-while-streaming routing get direct coverage.
