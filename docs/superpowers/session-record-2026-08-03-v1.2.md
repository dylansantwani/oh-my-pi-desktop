# Oh My Pi Desktop v0.2.0 — Session Record (2026-08-03)

**Status:** v0.2.0 implemented per the v1.2 design spec + plan, all tests green,
installer built, packaged-app smoke verified. Committed and pushed to
`github.com/dylansantwani/oh-my-pi-desktop`.

## What shipped (design: `docs/superpowers/specs/2026-08-03-omp-desktop-v1.2-design.md`)

1. **Default project — zero-dialog launch.** `ProjectMemory.defaultProjectDir()`
   auto-creates `~/omp-workspace`; `App.tsx` connects to the recalled project,
   else the default workspace. Onboarding modal deleted; first-run toast
   explains the default and how to change it. Folder picker never required.
2. **Claude-style three-pane layout.**
   - Left sidebar: app mark + New chat, session search, sessions grouped by
     day (Today / Yesterday / Previous 7 days / Older), active-session accent
     + streaming spinner, double-click rename, footer project chip.
   - Center: transcript + composer (unchanged behavior).
   - Right panel (new, 320px): tabs **Todos / Files / Context**.
3. **Todos tab** — collapsible phases, per-status icons (pending/in_progress/
   completed/blocked/dropped), phase progress pill (`done/total`).
4. **Files tab + FileViewer** — session-touched files tracked from
   `tool_execution_start` events (pure `lib/files.ts`: path extraction,
   dedupe, modified flag; dir-search tools excluded). New sandboxed-safe IPC
   `omp:read_file` with a project-root boundary + 512 KB preview cap
   (`src/main/read-file.ts`). Viewer modal: name/path/size, highlight.js
   highlighting, inline error states.
5. **Context tab** — model picker, thinking level, fast mode, session name
   rename, context-usage bar (color escalates >70% / >90%). TopBar slimmed to
   project + export + palette + refresh; StatusBar dropped the model chip.
6. **Visual pass** — zinc-neutral dark tokens, blue accent, three-pane grid,
   hover/focus states, right-panel component styles. Dead CSS removed
   (onboarding, topbar selects, model-chip, todo-bullet).

## Verification evidence

- **Unit + component:** 68 passed / 2 skipped (`npx -y node@22.12.0
  node_modules/vitest/vitest.mjs run`). New coverage: `files.test.ts` (8),
  `sessions.test.ts` (3), `read-file.test.ts` (5, temp-dir boundary/size/
  error cases), `right-panel.test.tsx` (5), `file-viewer.test.tsx` (4).
- **Typechecks:** `tsc -p tsconfig.node.json` and `-p tsconfig.web.json`
  clean.
- **Build:** `npm run build` exit 0. `npm run dist` → NSIS installer
  `dist/Oh My Pi Desktop Setup 0.2.0.exe` + blockmap + latest.yml.
- **Packaged smoke:** cleared userData `project.json`, launched the packaged
  exe → auto-connected to `~/omp-workspace` (recall fallback path), right
  panel rendered, composer enabled. Prompt sent through the UI, streaming
  reply rendered.
- **Schema finding (fixed during smoke):** real `omp` emits
  `tool_execution_start` with a **`toolName`** field (`write`), while the mock
  fixture used `name`. Extraction now reads `toolName` with `name` fallback —
  without this, write tools were tracked but never marked modified. Covered by
  a regression test. The agent wrote + read back `hello.txt` in the default
  workspace; Files tab showed it with the **edited** badge, and the FileViewer
  rendered its content through the sandboxed `omp:read_file` IPC.

## Process notes

- Followed superpowers brainstorming → spec → plan → implementation
  (writing-plans skill). Executed inline in the repo working tree (not a
  worktree) at the user's request; committed per task.
- One plan deviation: `glob`-family tools were excluded from file extraction
  entirely (their `path` args are directories, not files) — covered by the
  DIR_TOOLS set and a test.
- Node floor >= 22.12.0 applies to `npm test` (jsdom ESM require); system
  Node on this machine is 22.11.0, so tests run via
  `npx -y node@22.12.0 node_modules/vitest/vitest.mjs run`.
