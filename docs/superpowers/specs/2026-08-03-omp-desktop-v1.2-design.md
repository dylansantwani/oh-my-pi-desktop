# Oh My Pi Desktop v1.2 — Claude-style UI + Default Project + File Viewer

**Date:** 2026-08-03
**Status:** Approved by user in conversation (design presented inline, "Yes build it")
**Version target:** 0.2.0

## Problem

1. The app forces the user to pick a project folder (onboarding modal / native
   dialog) before anything works. The user wants a zero-dialog launch: connect
   to a default project automatically.
2. The UI is functional but not polished. The user wants a Claude-like layout:
   conversation sidebar with day grouping, an in-progress/finished task list,
   and a file viewer.

## Decisions (user-confirmed)

- **Default project:** last-used project when present; otherwise auto-create
  and connect to `~/omp-workspace`. Folder picker stays available but is never
  required.
- **Todo states:** right-hand panel with tabs (Todos / Files / Context),
  Claude-desktop style. Todos render with phase headers, status icons, and a
  phase progress pill.
- **File viewer:** session-touched files (read/written/edited), click to view
  content, "modified" badge on edits. New IPC for reading files. Not a full
  project explorer.

## Design

### 1. Default project (zero-dialog launch)

- `src/main/session-store.ts`: extend `ProjectMemory` with
  `defaultProjectDir(): string` — resolves `~/omp-workspace` (via `os.homedir()`)
  and `mkdirSync(recursive)` if missing.
- New IPC `omp:default_project` returning that path.
- `src/renderer/src/App.tsx` start flow: `recallProject()` → connect if set;
  else `default_project` → connect. Onboarding modal removed; replaced by a
  dismissible first-run toast ("Connected to your default workspace").
- `Onboarding.tsx` becomes the toast, or is deleted and the toast is inline.
- Failure to create the dir → error toast + fall back to the picker.

### 2. Layout (Claude-style)

- **Left sidebar** (`Sidebar.tsx` rework), 260px:
  - Header: app mark + "New chat".
  - Search input filtering sessions by title (case-insensitive).
  - Sessions grouped by day buckets from `mtimeMs`: Today / Yesterday /
    Previous 7 days / Older. Pure helper `groupSessionsByDay` (testable).
  - Active session: accent bar + streaming spinner when `isStreaming`.
  - Double-click rename kept; hover actions (rename).
  - Footer: project chip (click → change project).
- **Center**: transcript + composer (existing), visual polish only.
- **Right panel** (`RightPanel.tsx`, new), 320px, tab state in store
  (`rightTab: 'todos' | 'files' | 'context'`):
  - **Todos tab:** reuse todo data (`TodoPhase[]`); render phases collapsible,
    per-task status icon by `status` (pending/in_progress/completed/blocked/
    dropped), phase progress pill "n/total".
  - **Files tab:** session file list (see §3), extension icon, modified badge,
    click → FileViewer.
  - **Context tab:** model picker, thinking level, fast mode, context usage bar
    (tokens + % with color), editable session name. These controls move out of
    TopBar/StatusBar.
- **TopBar** slimmed: project path button, session title, export, command
  palette trigger. **StatusBar** becomes a slim footer pill (connection +
  model).

### 3. File viewer

- **Tracking** (`src/renderer/src/lib/files.ts`, new, pure):
  `extractFilePaths(ev: Record<string, unknown>): FileRef[]` — parses
  `tool_execution_start` events; known tools `read`/`write`/`edit`/`glob`/
  `grep`/`bash`-adjacent; reads `path`/`file`/`cwd`-style fields from args;
  normalizes to absolute paths against the project cwd (passed in); dedupes;
  marks `modified: true` for write/edit-style tools.
  `mergeFileRefs(prev, next)` for store updates. Deterministic, no I/O.
- **IPC** (`src/main/ipc.ts` + preload + `shared/omp-api.ts`):
  `omp:read_file(path)` → `{ ok: true, content, size } | { ok: false, error }`.
  Security boundary: path must resolve inside the connected project dir
  (`path.resolve` + prefix check) — the renderer is sandboxed and must not read
  arbitrary files. 512 KB preview cap ("file too large to preview").
- **Viewer** (`FileViewer.tsx`): modal over the transcript; file name, absolute
  path, size, highlighted content (highlight.js already a dependency),
  modified badge. Error states rendered inline (ENOENT / EACCES / too large).

### 4. Visual polish (`global.css` rework)

- Design tokens: zinc dark scale, subtle borders, accent blue; 260px left rail,
  320px right rail; refined typography, hover/focus states; rounded tool cards;
  smoother streaming caret. No functional regressions.

### 5. Error handling

- read_file: ENOENT/EACCES → friendly inline error; >512KB → too-large notice.
- default dir creation failure → toast + picker fallback.
- Session grouping: null/absent mtime → 'Older'.

### 6. Testing

- Unit (vitest, mock-omp fixtures):
  - `files.ts`: path extraction per tool shape, dedupe, modified flag, absolute
    normalization; `mergeFileRefs`.
  - `groupSessionsByDay`: bucket boundaries (today/yesterday/7d/older, null mtime).
  - IPC read_file: allow inside project root, deny `..` escape and absolute
    paths outside root (mock fs or temp dirs).
- Component (jsdom + testing-library harness exists):
  - RightPanel tabs switch; Todos status icons render per status; FileViewer
    loading + error states.
- Manual smoke: fresh launch → auto-connect to default workspace → prompt →
  todo_reminder renders in Todos tab → tool use records files → file opens.

### 7. Out of scope (YAGNI)

Full project explorer, message search, session delete, code signing,
cross-platform work.

## Verification

- `npx -y node@22.12.0 node_modules/vitest/vitest.mjs run` (Node floor) — all
  green including new tests.
- `npm run build` + packaged-app smoke (launch → auto-connect → chat).
- Version bump to 0.2.0; commit + push to `dylansantwani/oh-my-pi-desktop`.
