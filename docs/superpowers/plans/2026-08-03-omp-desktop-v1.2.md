# Oh My Pi Desktop v1.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** v0.2.0 — zero-dialog launch (default project), Claude-style three-pane UI (day-grouped session sidebar, right panel with Todos/Files/Context tabs), and a session file viewer.

**Architecture:** Pure logic (file tracking, day grouping, project-root-bound file reads) extracted as testable units; IPC surface extended by exactly two channels (`omp:default_project`, `omp:read_file`) with the renderer kept sandboxed; UI reworked into three panes with a right-side tabbed panel.

**Tech Stack:** Electron 43 + electron-vite 5 + React 19 + zustand 5 + lucide-react + highlight.js, vitest 4 (jsdom for components), Node ≥ 22.12.0.

## Global Constraints

- Node floor **≥ 22.12.0** — run tests with `npx -y node@22.12.0 node_modules/vitest/vitest.mjs run` (system Node 22.11.0 breaks the jsdom pool).
- Renderer is sandboxed (`sandbox: true`, no `nodeIntegration`) — all file reads MUST go through the new IPC with a project-root boundary; never expose raw `fs` to the renderer.
- Follow existing patterns: pure helpers in `src/renderer/src/lib/`, components in `src/renderer/src/components/`, IPC in `src/main/ipc.ts`, preload in `src/preload/index.ts`, shared types in `src/shared/omp-api.ts`.
- Version bump to 0.2.0 in `package.json`, `package-lock.json` root entry, and the README badge.
- Tests: unit files under `test/` (vitest, no jsdom needed unless stated); component tests under `test/renderer/` (jsdom + testing-library, pattern: `test/renderer/ui-request.test.tsx`).
- No dependency additions. lucide-react and highlight.js are already installed.

---

### Task 1: File tracking — `lib/files.ts`

**Files:**
- Create: `src/renderer/src/lib/files.ts`
- Test: `test/files.test.ts`

**Interfaces:**
- Produces:
  - `export interface FileRef { path: string; name: string; modified: boolean; firstSeenAt: number }`
  - `export function extractFileRefs(ev: Record<string, unknown>, projectDir: string): FileRef[]`
  - `export function mergeFileRefs(prev: FileRef[], next: FileRef[]): FileRef[]`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { extractFileRefs, mergeFileRefs, type FileRef } from '../src/renderer/src/lib/files'

const DIR = 'C:\\proj'

function tool(name: string, args: Record<string, unknown>): Record<string, unknown> {
  return { type: 'tool_execution_start', toolCallId: 't1', name, args }
}

describe('extractFileRefs', () => {
  it('returns [] for non-tool events', () => {
    expect(extractFileRefs({ type: 'message_update' }, DIR)).toEqual([])
  })
  it('extracts a read tool path, not modified', () => {
    const refs = extractFileRefs(tool('read', { path: 'a.txt' }), DIR)
    expect(refs).toHaveLength(1)
    expect(refs[0].path).toBe('C:\\proj\\a.txt')
    expect(refs[0].name).toBe('a.txt')
    expect(refs[0].modified).toBe(false)
  })
  it('marks write/edit/append tools as modified', () => {
    for (const name of ['write', 'edit', 'append', 'apply_patch']) {
      const [ref] = extractFileRefs(tool(name, { path: 'x.ts' }), DIR)
      expect(ref.modified).toBe(true)
    }
  })
  it('treats absolute paths as absolute', () => {
    const [ref] = extractFileRefs(tool('read', { path: 'C:\\other\\f.txt' }), DIR)
    expect(ref.path).toBe('C:\\other\\f.txt')
  })
  it('ignores glob patterns (values containing * or ?)', () => {
    expect(extractFileRefs(tool('glob', { pattern: 'src/**/*.ts', path: 'src' }), DIR)).toEqual([])
    expect(extractFileRefs(tool('read', { path: '*.md' }), DIR)).toEqual([])
  })
  it('extracts from unknown tools via explicit file keys', () => {
    const [ref] = extractFileRefs(tool('custom_tool', { filePath: 'z.log' }), DIR)
    expect(ref.path).toBe('C:\\proj\\z.log')
  })
  it('ignores non-string and empty path values', () => {
    expect(extractFileRefs(tool('read', { path: 42 }), DIR)).toEqual([])
    expect(extractFileRefs(tool('read', { path: '' }), DIR)).toEqual([])
  })
})

describe('mergeFileRefs', () => {
  it('dedupes by path and preserves modified across merges', () => {
    const a: FileRef[] = [{ path: 'C:\\proj\\a.txt', name: 'a.txt', modified: false, firstSeenAt: 1 }]
    const b: FileRef[] = [
      { path: 'C:\\proj\\a.txt', name: 'a.txt', modified: true, firstSeenAt: 2 },
      { path: 'C:\\proj\\b.txt', name: 'b.txt', modified: false, firstSeenAt: 3 }
    ]
    const out = mergeFileRefs(a, b)
    expect(out).toHaveLength(2)
    expect(out.find((f) => f.path.endsWith('a.txt'))?.modified).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx -y node@22.12.0 node_modules/vitest/vitest.mjs run test/files.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/files.ts`**

```ts
// Pure file tracking from tool_execution_start events. No I/O.
export interface FileRef {
  path: string
  name: string
  modified: boolean
  firstSeenAt: number
}

// Tools that act on a single file and whose path args we trust.
const FILE_TOOLS = new Set(['read', 'write', 'edit', 'append', 'apply_patch', 'rename', 'move', 'delete', 'remove'])
// Tools that change file state — surfaced as "modified" in the Files tab.
const WRITE_TOOLS = new Set(['write', 'edit', 'append', 'apply_patch', 'rename', 'move', 'delete', 'remove'])
// Arg keys that name a file (any tool). 'pattern' is glob input, never a file.
const FILE_KEYS = new Set(['path', 'file', 'filePath', 'file_path', 'filename'])

export function extractFileRefs(ev: Record<string, unknown>, projectDir: string): FileRef[] {
  if (ev.type !== 'tool_execution_start') return []
  const name = typeof ev.name === 'string' ? ev.name : ''
  const args = ev.args
  if (!args || typeof args !== 'object' || Array.isArray(args)) return []
  const out: FileRef[] = []
  const pushPath = (raw: unknown): void => {
    if (typeof raw !== 'string' || !raw) return
    if (raw.includes('*') || raw.includes('?')) return // glob pattern, not a file
    const abs = /^[a-zA-Z]:[\\/]|^\\\\|^\//.test(raw) ? raw : `${projectDir}\\${raw}`.replace(/\//g, '\\')
    const base = abs.split('\\').pop() ?? abs
    out.push({ path: abs, name: base, modified: WRITE_TOOLS.has(name), firstSeenAt: Date.now() })
  }
  if (FILE_TOOLS.has(name)) {
    for (const [k, v] of Object.entries(args)) if (k.toLowerCase().endsWith('path') || FILE_KEYS.has(k)) pushPath(v)
  } else {
    for (const k of FILE_KEYS) pushPath(args[k])
  }
  return out
}

export function mergeFileRefs(prev: FileRef[], next: FileRef[]): FileRef[] {
  const map = new Map(prev.map((f) => [f.path, f]))
  for (const f of next) {
    const ex = map.get(f.path)
    map.set(f.path, ex ? { ...ex, modified: ex.modified || f.modified } : f)
  }
  return [...map.values()]
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx -y node@22.12.0 node_modules/vitest/vitest.mjs run test/files.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/lib/files.ts test/files.test.ts
git commit -m "feat: session file tracking (pure extraction + merge)"
```

---

### Task 2: Session day grouping — `lib/sessions.ts`

**Files:**
- Create: `src/renderer/src/lib/sessions.ts`
- Test: `test/sessions.test.ts`

**Interfaces:**
- Consumes: `SessionInfo` shape = `{ path: string; title: string; cwd: string; mtimeMs: number; sizeBytes: number }` (already produced by `session-scanner.ts` / `listSessions`).
- Produces:
  - `export type SessionGroup = { label: 'Today' | 'Yesterday' | 'Previous 7 days' | 'Older'; items: SessionInfo[] }`
  - `export function groupSessionsByDay(sessions: SessionInfo[], now?: Date): SessionGroup[]`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { groupSessionsByDay, type SessionInfo } from '../src/renderer/src/lib/sessions'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-08-03T12:00:00Z')
function s(mtimeMs: number | null, title: string): SessionInfo {
  return { path: `/s/${title}`, title, cwd: '/proj', mtimeMs: mtimeMs ?? 0, sizeBytes: 1 }
}

describe('groupSessionsByDay', () => {
  it('buckets today / yesterday / previous 7 days / older', () => {
    const groups = groupSessionsByDay(
      [
        s(NOW.getTime(), 'today'),
        s(NOW.getTime() - DAY, 'yesterday'),
        s(NOW.getTime() - 3 * DAY, 'three-days'),
        s(NOW.getTime() - 30 * DAY, 'old')
      ],
      NOW
    )
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', 'Previous 7 days', 'Older'])
    expect(groups[0].items.map((i) => i.title)).toEqual(['today'])
    expect(groups[2].items.map((i) => i.title)).toEqual(['three-days'])
    expect(groups[3].items.map((i) => i.title)).toEqual(['old'])
  })
  it('sorts items newest-first within a group', () => {
    const groups = groupSessionsByDay(
      [s(NOW.getTime() - 2 * DAY, 'older-in-bucket'), s(NOW.getTime() - DAY, 'newer-in-bucket')],
      NOW
    )
    expect(groups[1].items.map((i) => i.title)).toEqual(['newer-in-bucket', 'older-in-bucket'])
  })
  it('drops groups with no items and puts null/invalid mtime in Older', () => {
    const groups = groupSessionsByDay([s(null, 'no-mtime')], NOW)
    expect(groups.map((g) => g.label)).toEqual(['Older'])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx -y node@22.12.0 node_modules/vitest/vitest.mjs run test/sessions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/sessions.ts`**

```ts
export interface SessionInfo {
  path: string
  title: string
  cwd: string
  mtimeMs: number
  sizeBytes: number
}

export type SessionGroup = { label: 'Today' | 'Yesterday' | 'Previous 7 days' | 'Older'; items: SessionInfo[] }
const DAY = 24 * 60 * 60 * 1000

export function groupSessionsByDay(sessions: SessionInfo[], now: Date = new Date()): SessionGroup[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const buckets: Record<string, SessionInfo[]> = { Today: [], Yesterday: [], 'Previous 7 days': [], Older: [] }
  for (const s of sessions) {
    if (!Number.isFinite(s.mtimeMs) || s.mtimeMs <= 0) {
      buckets.Older.push(s)
      continue
    }
    const d = new Date(s.mtimeMs)
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const diffDays = Math.round((today - dayStart) / DAY)
    const label = diffDays <= 0 ? 'Today' : diffDays === 1 ? 'Yesterday' : diffDays <= 7 ? 'Previous 7 days' : 'Older'
    buckets[label].push(s)
  }
  const order: Array<SessionGroup['label']> = ['Today', 'Yesterday', 'Previous 7 days', 'Older']
  return order
    .map((label) => ({ label, items: buckets[label].sort((a, b) => b.mtimeMs - a.mtimeMs) }))
    .filter((g) => g.items.length > 0)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx -y node@22.12.0 node_modules/vitest/vitest.mjs run test/sessions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/lib/sessions.ts test/sessions.test.ts
git commit -m "feat: session day grouping helper"
```

---

### Task 3: Project-root file reads + default project IPC

**Files:**
- Create: `src/main/read-file.ts`
- Test: `test/read-file.test.ts`
- Modify: `src/main/session-store.ts`, `src/main/ipc.ts`, `src/preload/index.ts`, `src/shared/omp-api.ts`

**Interfaces:**
- Produces (shared/omp-api.ts — type lives in shared so main and renderer agree):
  - `export type ReadFileResult = { ok: true; content: string; size: number } | { ok: false; error: string }`
  - `OmpApi.defaultProject(): Promise<string>`
  - `OmpApi.readFile(path: string): Promise<ReadFileResult>`
- `src/main/read-file.ts`:
  - `export const PREVIEW_LIMIT = 512 * 1024`
  - `export async function readProjectFile(root: string, filePath: string): Promise<ReadFileResult>`
- `ProjectMemory.defaultProjectDir(): string` — resolves `join(homedir(), 'omp-workspace')`, `mkdirSync(recursive)` in a try/catch, returns the path either way.

- [ ] **Step 1: Write the failing tests** (`test/read-file.test.ts`, temp dirs — pattern from `test/session-store.test.ts`)

```ts
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readProjectFile } from '../src/main/read-file'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'omp-read-'))
  mkdirSync(join(root, 'sub'))
  writeFileSync(join(root, 'a.txt'), 'hello')
  writeFileSync(join(root, 'sub', 'b.txt'), 'nested')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('readProjectFile', () => {
  it('reads a file inside the project root', async () => {
    const res = await readProjectFile(root, join(root, 'a.txt'))
    expect(res).toEqual({ ok: true, content: 'hello', size: 5 })
  })
  it('rejects paths outside the root (.. escape)', async () => {
    const res = await readProjectFile(root, join(root, '..', 'escape.txt'))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/outside/i)
  })
  it('rejects absolute paths outside the root', async () => {
    const res = await readProjectFile(root, join(tmpdir(), 'somewhere-else.txt'))
    expect(res.ok).toBe(false)
  })
  it('returns file-not-found for missing files', async () => {
    const res = await readProjectFile(root, join(root, 'nope.txt'))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/not found/i)
  })
  it('rejects directories and oversized files', async () => {
    const dir = await readProjectFile(root, join(root, 'sub'))
    expect(dir.ok).toBe(false)
    writeFileSync(join(root, 'big.bin'), Buffer.alloc(600 * 1024))
    const big = await readProjectFile(root, join(root, 'big.bin'))
    expect(big.ok).toBe(false)
    if (!big.ok) expect(big.error).toMatch(/too large/i)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx -y node@22.12.0 node_modules/vitest/vitest.mjs run test/read-file.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/main/read-file.ts`**

```ts
import { stat, readFile } from 'fs/promises'
import { resolve, sep } from 'path'
import type { ReadFileResult } from '../shared/omp-api'

export const PREVIEW_LIMIT = 512 * 1024

export async function readProjectFile(root: string, filePath: string): Promise<ReadFileResult> {
  if (typeof filePath !== 'string' || !filePath) return { ok: false, error: 'invalid path' }
  const abs = resolve(filePath)
  const base = resolve(root)
  if (abs !== base && !abs.startsWith(base + sep)) return { ok: false, error: 'path is outside the project' }
  try {
    const st = await stat(abs)
    if (!st.isFile()) return { ok: false, error: 'not a file' }
    if (st.size > PREVIEW_LIMIT) return { ok: false, error: 'file too large to preview' }
    const content = await readFile(abs, 'utf8')
    return { ok: true, content, size: st.size }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    return { ok: false, error: code === 'ENOENT' ? 'file not found' : (e as Error).message }
  }
}
```

- [ ] **Step 4: Wire `ProjectMemory.defaultProjectDir()`** in `src/main/session-store.ts`:

```ts
import { homedir } from 'os'
// class ProjectMemory — add:
defaultProjectDir(): string {
  const dir = join(homedir(), 'omp-workspace')
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    /* connect() surfaces the real failure if the dir is unusable */
  }
  return dir
}
```

- [ ] **Step 5: Extend the IPC surface** in `src/main/ipc.ts` (inside `registerIpc`):

```ts
import { readProjectFile } from './read-file'
// …
ipcMain.handle('omp:default_project', () => memory.defaultProjectDir())
ipcMain.handle('omp:read_file', (_e, filePath: string) => {
  const root = host.project
  if (!root) return { ok: false as const, error: 'no project connected' }
  return readProjectFile(root, filePath)
})
```

- [ ] **Step 6: Extend shared types + preload**

`src/shared/omp-api.ts` — add above `OmpApi`:

```ts
export type ReadFileResult = { ok: true; content: string; size: number } | { ok: false; error: string }
```

and inside `OmpApi`:

```ts
defaultProject(): Promise<string>
readFile(path: string): Promise<ReadFileResult>
```

`src/preload/index.ts` — inside `const api: OmpApi = { … }`:

```ts
defaultProject: () => ipcRenderer.invoke('omp:default_project'),
readFile: (path) => ipcRenderer.invoke('omp:read_file', path),
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx -y node@22.12.0 node_modules/vitest/vitest.mjs run test/read-file.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/main/read-file.ts src/main/session-store.ts src/main/ipc.ts src/preload/index.ts src/shared/omp-api.ts test/read-file.test.ts
git commit -m "feat: project-root file reads + default project IPC"
```

---

### Task 4: Store — right panel state + file tracking wiring

**Files:**
- Modify: `src/renderer/src/store.ts`

**Interfaces:**
- Consumes: `FileRef`, `extractFileRefs`, `mergeFileRefs` (Task 1); `window.omp.defaultProject` (Task 3).
- Produces:
  - state: `rightTab: 'todos' | 'files' | 'context'`, `sessionFiles: FileRef[]`, `openFilePath: string | null`
  - actions: `setRightTab(tab: 'todos' | 'files' | 'context')`, `setOpenFile(path: string | null)`
  - `connect` still returns `{ ok }` but no longer required to be called with a project that exists — unchanged signature.

- [ ] **Step 1: Extend `AppState` interface** in `src/renderer/src/store.ts`:

```ts
rightTab: 'todos' | 'files' | 'context'
sessionFiles: FileRef[]
openFilePath: string | null
setRightTab: (tab: 'todos' | 'files' | 'context') => void
setOpenFile: (path: string | null) => void
```

(add `import { extractFileRefs, mergeFileRefs, type FileRef } from './lib/files'`)

- [ ] **Step 2: Add defaults and actions** in the `create<AppState>((set, get) => ({ … }))` initializer:

```ts
rightTab: 'todos',
sessionFiles: [],
openFilePath: null,

setRightTab: (tab) => set({ rightTab: tab }),
setOpenFile: (path) => set({ openFilePath: path }),
```

- [ ] **Step 3: Wire tool-event tracking + per-session reset**

In `switchSession` and `newSession`, add `sessionFiles: [], openFilePath: null` to their `set({ … })` calls.

In the `api.onEvent` block, inside the existing `tool_execution_start` handling (add a new branch before the reducer `if`):

```ts
if (type === 'tool_execution_start') {
  const project = useAppStore.getState().project
  if (project) {
    const refs = extractFileRefs(frame, project)
    if (refs.length > 0) {
      useAppStore.setState((prev) => ({ sessionFiles: mergeFileRefs(prev.sessionFiles, refs) }))
    }
  }
}
```

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc -p tsconfig.web.json --noEmit`
Expected: clean (no errors).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/store.ts
git commit -m "feat: store — right panel tab, session files, open file state"
```

---

### Task 5: Right panel (tabs) + TodoPanel rework + FileViewer + ContextPanel

**Files:**
- Create: `src/renderer/src/components/RightPanel.tsx`, `src/renderer/src/components/FilesPanel.tsx`, `src/renderer/src/components/FileViewer.tsx`, `src/renderer/src/components/ContextPanel.tsx`
- Modify: `src/renderer/src/components/TodoPanel.tsx` (rework)
- Test: `test/renderer/right-panel.test.tsx`, `test/renderer/file-viewer.test.tsx` (jsdom harness; mock `window.omp`)

**Interfaces:**
- Consumes: store fields from Task 4; `ReadFileResult` (Task 3); `TodoPhase`/`TodoTask` (already in store.ts).
- Produces: `<RightPanel />` rendered by `App.tsx`; `<FileViewer />` rendered when `openFilePath !== null`; `<ContextPanel />` containing the model/thinking/fast-mode controls moved out of `TopBar`.

- [ ] **Step 1: Rework `TodoPanel.tsx`** — collapsible phases, per-status icons, progress pill:

```tsx
import React, { useState } from 'react'
import { useAppStore } from '../store'
import { Check, Circle, Clock, Ban, X, ChevronDown, ChevronRight } from 'lucide-react'

const STATUS_ICON: Record<string, React.JSX.Element> = {
  pending: <Circle size={12} />,
  in_progress: <Clock size={12} className="todo-spin" />,
  completed: <Check size={12} />,
  blocked: <Ban size={12} />,
  dropped: <X size={12} />
}
const STATUS_CLASS: Record<string, string> = {
  pending: 'todo-pending',
  in_progress: 'todo-progress',
  completed: 'todo-done',
  blocked: 'todo-blocked',
  dropped: 'todo-dropped'
}

export function TodoPanel(): React.JSX.Element | null {
  const todos = useAppStore((s) => s.todos)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  if (todos.length === 0) return <div className="panel-empty">No tasks yet — ask the agent to plan something.</div>
  return (
    <div className="todo-panel">
      {todos.map((phase) => {
        const done = phase.tasks.filter((t) => t.status === 'completed').length
        const isCollapsed = collapsed.has(phase.id)
        return (
          <div key={phase.id} className="todo-phase">
            <button
              className="todo-phase-name"
              onClick={() =>
                setCollapsed((prev) => {
                  const next = new Set(prev)
                  if (next.has(phase.id)) next.delete(phase.id)
                  else next.add(phase.id)
                  return next
                })
              }
            >
              {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              <span className="ellipsis">{phase.name}</span>
              <span className="todo-progress-pill">
                {done}/{phase.tasks.length}
              </span>
            </button>
            {!isCollapsed &&
              phase.tasks.map((t) => (
                <div key={t.id} className={`todo-task ${STATUS_CLASS[t.status] ?? 'todo-pending'}`}>
                  <span className="todo-status-icon">{STATUS_ICON[t.status] ?? <Circle size={12} />}</span>
                  <span className="ellipsis">{t.content}</span>
                </div>
              ))}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Create `FilesPanel.tsx`** — session file list:

```tsx
import React from 'react'
import { useAppStore } from '../store'
import { FileCode, FileJson, FileText, File, Pencil } from 'lucide-react'

function iconFor(name: string): React.JSX.Element {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'json') return <FileJson size={14} />
  if (['ts', 'tsx', 'js', 'jsx', 'css', 'html', 'py', 'rs', 'go', 'md'].includes(ext ?? '')) return <FileCode size={14} />
  if (ext) return <FileText size={14} />
  return <File size={14} />
}

export function FilesPanel(): React.JSX.Element {
  const files = useAppStore((s) => s.sessionFiles)
  const setOpenFile = useAppStore((s) => s.setOpenFile)
  if (files.length === 0) return <div className="panel-empty">Files the agent touches this session will show up here.</div>
  return (
    <div className="files-panel">
      {files.map((f) => (
        <button key={f.path} className="file-row" onClick={() => setOpenFile(f.path)} title={f.path}>
          <span className="file-icon">{iconFor(f.name)}</span>
          <span className="ellipsis file-name">{f.name}</span>
          {f.modified && (
            <span className="modified-badge" title="Modified this session">
              <Pencil size={10} /> edited
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Create `FileViewer.tsx`** — modal with content/error/loading states (mock `window.omp.readFile` in tests):

```tsx
import React, { useEffect, useState } from 'react'
import hljs from 'highlight.js'
import { useAppStore } from '../store'
import { X, FileWarning } from 'lucide-react'
import type { ReadFileResult } from '../../../shared/omp-api'

export function FileViewer(): React.JSX.Element | null {
  const path = useAppStore((s) => s.openFilePath)
  const setOpenFile = useAppStore((s) => s.setOpenFile)
  const [state, setState] = useState<{ loading: boolean } | ReadFileResult>({ loading: true })

  useEffect(() => {
    if (!path) return
    setState({ loading: true })
    void window.omp.readFile(path).then(setState)
  }, [path])

  if (!path) return null
  const name = path.split(/[\\/]/).pop() ?? path
  const ext = name.split('.').pop()?.toLowerCase() ?? ''

  return (
    <div className="file-viewer-overlay" onClick={() => setOpenFile(null)}>
      <div className="file-viewer" onClick={(e) => e.stopPropagation()}>
        <div className="file-viewer-head">
          <span className="file-viewer-name">{name}</span>
          <span className="file-viewer-path">{path}</span>
          <button className="icon-btn" onClick={() => setOpenFile(null)} title="Close">
            <X size={14} />
          </button>
        </div>
        <div className="file-viewer-body">
          {'loading' in state && state.loading && <div className="panel-empty">Loading…</div>}
          {'ok' in state && !state.ok && <div className="file-error"><FileWarning size={14} /> {state.error}</div>}
          {'ok' in state && state.ok && (
            <pre className="file-code">
              <code
                dangerouslySetInnerHTML={{
                  __html:
                    ext && hljs.getLanguage(ext)
                      ? hljs.highlight(state.content, { language: ext }).value
                      : hljs.highlightAuto(state.content).value
                }}
              />
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `ContextPanel.tsx`** — move model/thinking/fast-mode/context controls from `TopBar` (copy the select + toggle JSX from `TopBar.tsx`, add a context-usage bar and editable session name):

```tsx
import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import { Zap, ZapOff } from 'lucide-react'

const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

export function ContextPanel(): React.JSX.Element {
  const model = useAppStore((s) => s.model)
  const status = useAppStore((s) => s.status)
  const thinkingLevel = useAppStore((s) => s.thinkingLevel)
  const fastMode = useAppStore((s) => s.fastMode)
  const sessionName = useAppStore((s) => s.sessionName)
  const contextUsage = useAppStore((s) => s.contextUsage)
  const setModel = useAppStore((s) => s.setModel)
  const setThinkingLevel = useAppStore((s) => s.setThinkingLevel)
  const setFastMode = useAppStore((s) => s.setFastMode)
  const renameSession = useAppStore((s) => s.renameSession)
  const [models, setModels] = useState<{ provider: string; id: string }[]>([])
  const [nameDraft, setNameDraft] = useState<string | null>(null)

  useEffect(() => {
    if (status !== 'connected') return
    void (async () => {
      try {
        const data = (await window.omp.getModels()) as { models?: { provider: string; id: string }[]; data?: unknown }
        const list = Array.isArray(data.models) ? data.models : Array.isArray(data) ? data : []
        setModels(list)
      } catch {
        /* not connected */
      }
    })()
  }, [model, status])

  const pct = contextUsage ? Math.min(100, Math.round(contextUsage.percent * 100)) : 0

  return (
    <div className="context-panel">
      <div className="ctx-section">
        <label className="sidebar-label">Model</label>
        <select
          className="ctx-select"
          value={model ? `${model.provider}/${model.id}` : ''}
          onChange={(e) => {
            const [provider, ...rest] = e.target.value.split('/')
            void setModel(provider, rest.join('/'))
          }}
        >
          <option value="" disabled>{model ? `${model.provider}/${model.id}` : 'Model…'}</option>
          {models.map((m) => (
            <option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
              {m.provider}/{m.id}
            </option>
          ))}
        </select>
      </div>
      <div className="ctx-section">
        <label className="sidebar-label">Thinking level</label>
        <select className="ctx-select" value={thinkingLevel} onChange={(e) => void setThinkingLevel(e.target.value)}>
          {THINKING_LEVELS.map((l) => (
            <option key={l} value={l}>think: {l}</option>
          ))}
        </select>
      </div>
      <div className="ctx-section">
        <label className="sidebar-label">Fast mode</label>
        <button className={`btn ${fastMode ? 'on' : ''}`} onClick={() => void setFastMode(!fastMode)}>
          {fastMode ? <Zap size={14} /> : <ZapOff size={14} />} {fastMode ? 'On' : 'Off'}
        </button>
      </div>
      <div className="ctx-section">
        <label className="sidebar-label">Session name</label>
        <input
          className="ctx-input"
          value={nameDraft ?? sessionName}
          placeholder="Untitled session"
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => {
            if (nameDraft !== null && nameDraft.trim()) void renameSession(nameDraft.trim())
            setNameDraft(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
          }}
        />
      </div>
      {contextUsage && (
        <div className="ctx-section">
          <label className="sidebar-label">Context</label>
          <div className="ctx-usage">
            <span>{contextUsage.tokens.toLocaleString()} tokens · {pct}%</span>
            <div className="ctx-bar">
              <div className={`ctx-fill ${pct > 90 ? 'danger' : pct > 70 ? 'warn' : ''}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Create `RightPanel.tsx`** — tab shell:

```tsx
import React from 'react'
import { useAppStore } from '../store'
import { TodoPanel } from './TodoPanel'
import { FilesPanel } from './FilesPanel'
import { ContextPanel } from './ContextPanel'
import { CheckSquare, Files, SlidersHorizontal } from 'lucide-react'

const TABS = [
  { id: 'todos', label: 'Todos', icon: <CheckSquare size={13} /> },
  { id: 'files', label: 'Files', icon: <Files size={13} /> },
  { id: 'context', label: 'Context', icon: <SlidersHorizontal size={13} /> }
] as const

export function RightPanel(): React.JSX.Element {
  const tab = useAppStore((s) => s.rightTab)
  const setRightTab = useAppStore((s) => s.setRightTab)
  return (
    <aside className="right-panel">
      <div className="right-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`right-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setRightTab(t.id)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      <div className="right-panel-body">
        {tab === 'todos' && <TodoPanel />}
        {tab === 'files' && <FilesPanel />}
        {tab === 'context' && <ContextPanel />}
      </div>
    </aside>
  )
}
```

- [ ] **Step 6: Write component tests** (`test/renderer/right-panel.test.tsx`, `test/renderer/file-viewer.test.tsx`) — follow the mock pattern in `test/renderer/ui-request.test.tsx` (jsdom + @testing-library/react, stub `window.omp`). Cover: RightPanel switches tabs and renders each panel; FileViewer shows content on `readFile` ok and the error string on failure; TodoPanel renders status icons for mixed statuses.

- [ ] **Step 7: Run all renderer tests**

Run: `npx -y node@22.12.0 node_modules/vitest/vitest.mjs run test/renderer`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/components test/renderer
git commit -m "feat: right panel with Todos/Files/Context tabs + file viewer"
```

---

### Task 6: App shell, TopBar slim-down, default-project launch, Sidebar rework

**Files:**
- Modify: `src/renderer/src/App.tsx`, `src/renderer/src/components/TopBar.tsx`, `src/renderer/src/components/Sidebar.tsx`, `src/renderer/src/components/StatusBar.tsx`
- Delete: `src/renderer/src/components/Onboarding.tsx`

**Interfaces:**
- Consumes: `groupSessionsByDay` (Task 2), `window.omp.defaultProject` (Task 3), `RightPanel` (Task 5).
- Produces: the new three-pane shell; first-run toast; sidebar grouped/searchable list.

- [ ] **Step 1: `App.tsx`** — default-project launch + RightPanel + remove Onboarding:

```tsx
export default function App(): React.JSX.Element {
  const status = useAppStore((s) => s.status)
  useEffect(() => {
    void (async () => {
      const remembered = await window.omp.recallProject()
      const target = remembered ?? (await window.omp.defaultProject())
      if (!target) return
      await useAppStore.getState().connect(target)
      if (!remembered) {
        useAppStore.getState().toast('Connected to your default workspace — change it anytime from the sidebar footer.', 'info')
      }
    })()
  }, [])
  // …keyboard effect unchanged…
  return (
    <div className="app">
      <TopBar />
      <div className="app-body">
        <Sidebar />
        <main className="chat">
          <Transcript />
          <Composer />
        </main>
        <RightPanel />
      </div>
      <StatusBar />
      <UpdateBanner />
      <CommandPalette />
      <UiRequestModal />
      <FileViewer />
      <Toasts />
    </div>
  )
}
```

Remove the `project === null && status === 'offline' && <Onboarding />` line and the `Onboarding` import; add `import { RightPanel } from './components/RightPanel'` and `import { FileViewer } from './components/FileViewer'`. Delete `Onboarding.tsx`.

- [ ] **Step 2: Slim `TopBar.tsx`** — keep only title, project button, export, palette, refresh (delete the model select, thinking select, fast-mode button — they moved to ContextPanel):

```tsx
import React from 'react'
import { useAppStore } from '../store'
import { FolderOpen, RefreshCw, Command, FileDown } from 'lucide-react'

export function TopBar(): React.JSX.Element {
  const project = useAppStore((s) => s.project)
  return (
    <header className="topbar">
      <div className="topbar-title">
        <h1>Oh My Pi Desktop</h1>
      </div>
      <div className="topbar-controls">
        <button className="btn project-chip" onClick={() => void useAppStore.getState().pickProjectAndConnect()} title="Change project">
          <FolderOpen size={14} />
          <span className="ellipsis">{project ?? 'Choose a project…'}</span>
        </button>
        <button className="icon-btn" title="Export session" onClick={() => void useAppStore.getState().exportHtml()}>
          <FileDown size={14} />
        </button>
        <button className="icon-btn" title="Commands (Ctrl+K)" onClick={() => void useAppStore.getState().setPaletteOpen(true)}>
          <Command size={14} />
        </button>
        <button className="icon-btn" title="Refresh state" onClick={() => void useAppStore.getState().refreshState()}>
          <RefreshCw size={14} />
        </button>
      </div>
    </header>
  )
}
```

- [ ] **Step 3: Rework `Sidebar.tsx`** — search + day grouping + footer project chip. Key structure (keep rename/double-click behavior):

```tsx
import React, { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../store'
import { Plus, FolderOpen, Search } from 'lucide-react'
import { groupSessionsByDay } from '../lib/sessions'

export function Sidebar(): React.JSX.Element {
  const project = useAppStore((s) => s.project)
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionPath = useAppStore((s) => s.activeSessionPath)
  const isStreaming = useAppStore((s) => s.isStreaming)
  const refreshSessions = useAppStore((s) => s.refreshSessions)
  const pickProjectAndConnect = useAppStore((s) => s.pickProjectAndConnect)
  const switchSession = useAppStore((s) => s.switchSession)
  const newSession = useAppStore((s) => s.newSession)
  const [query, setQuery] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')

  useEffect(() => {
    void refreshSessions()
  }, [project, refreshSessions])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q ? sessions.filter((s) => s.title.toLowerCase().includes(q)) : sessions
    return groupSessionsByDay(filtered)
  }, [sessions, query])

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="brand-mark" aria-hidden="true">π</div>
        <span className="sidebar-app-name">Oh My Pi</span>
        <button className="icon-btn" onClick={() => void newSession()} title="New session (Ctrl+N)">
          <Plus size={14} />
        </button>
      </div>
      <div className="sidebar-search">
        <Search size={12} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search sessions…" />
      </div>
      <div className="session-list">
        {groups.length === 0 && <div className="sidebar-note">{query ? 'No sessions match.' : 'No sessions yet for this project.'}</div>}
        {groups.map((g) => (
          <div key={g.label} className="session-group">
            <div className="sidebar-label">{g.label}</div>
            {g.items.map((s) => (
              <div
                key={s.path}
                className={`session-item ${s.path === activeSessionPath ? 'active' : ''}`}
                onClick={() => switchSession(s.path)}
                onDoubleClick={() => { setRenaming(s.path); setRenameText(s.title) }}
                title={s.title}
              >
                <span className="ellipsis session-title">{s.title}</span>
                {s.path === activeSessionPath && isStreaming && <span className="session-spinner" aria-label="streaming" />}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="sidebar-foot">
        <button className="project-chip" onClick={() => void pickProjectAndConnect()} title="Change project">
          <FolderOpen size={13} />
          <span className="ellipsis">{project ?? 'Choose a project…'}</span>
        </button>
      </div>
    </aside>
  )
}
```

Note: rename input UI (previously inline) — keep the double-click rename via the `renaming` state rendering an `<input>` in place of the title, same as the old component. The click-vs-double-click debounce timer is replaced by plain click-to-switch + double-click-to-rename (React fires click before dblclick; to keep rename from also switching, gate the click with a short timer as the old code did — keep the `clickTimer` pattern).

- [ ] **Step 4: Slim `StatusBar.tsx`** — drop the model chip (model is in Context tab); keep status pill + context bar + tok/s + streaming dots (unchanged otherwise).

- [ ] **Step 5: Verify typecheck + full unit suite**

Run: `npx tsc -p tsconfig.web.json --noEmit && npx tsc -p tsconfig.node.json --noEmit`
Run: `npx -y node@22.12.0 node_modules/vitest/vitest.mjs run`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/renderer
git rm src/renderer/src/components/Onboarding.tsx
git commit -m "feat: Claude-style shell — default-project launch, grouped sidebar, slim top bar"
```

---

### Task 7: Visual polish — `global.css`

**Files:**
- Modify: `src/renderer/src/styles/global.css`

- [ ] **Step 1: Rework the stylesheet.** Full rewrite keeping every existing class name functional, adding: `.app` → grid rows `topbar / app-body / status-bar`; `.app-body` → grid columns `260px 1fr 320px`; `.right-panel`, `.right-tabs`, `.right-tab(.active)`, `.right-panel-body`, `.panel-empty`, `.todo-progress-pill`, `.todo-status-icon`, `.todo-spin` (rotate animation), `.files-panel`, `.file-row`, `.file-icon`, `.modified-badge`, `.file-viewer-overlay`, `.file-viewer`, `.file-viewer-head/-name/-path`, `.file-viewer-body`, `.file-code`, `.file-error`, `.ctx-section`, `.ctx-select`, `.ctx-input`, `.ctx-usage`, `.ctx-fill(.danger/.warn)`, `.sidebar-head`, `.sidebar-app-name`, `.sidebar-search`, `.session-group`, `.session-spinner`, `.project-chip`.

Design tokens (Claude-like dark):
- Backgrounds: `#0f0f10` app, `#171718` rails, `#1e1e20` hover, `#26262a` active.
- Borders: `#2b2b2f`; text: `#e6e6e9` primary, `#9a9aa2` secondary, `#5f5f66` muted.
- Accent: `#4f8cff` blue; danger `#e5484d`; warn `#f5a623`; success `#46a758`.
- Radii 6–8px; font stack: `'Segoe UI', system-ui, sans-serif`; mono: `'Cascadia Code', Consolas, monospace`.
- Keep markdown/tool-card/streaming styles from the current file (port them over).

- [ ] **Step 2: Verify the dev render**

Run: `npm run build`
Expected: exit 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/styles/global.css
git commit -m "style: Claude-like visual pass (tokens, three-pane grid, right panel)"
```

---

### Task 8: Version bump, full verification, smoke test

**Files:**
- Modify: `package.json` (version → 0.2.0), `package-lock.json` (root + packages[""].version), `README.md` (badge `version-0.1.1` → `version-0.2.0`)

- [ ] **Step 1: Bump version** to 0.2.0 in all three files (edit `package.json`, run `npm install --package-lock-only` to sync the lockfile, fix the README badge).

- [ ] **Step 2: Full verification**

Run: `npx -y node@22.12.0 node_modules/vitest/vitest.mjs run`
Expected: all tests pass (unit + renderer), including the new files/sessions/read-file/right-panel/file-viewer tests.
Run: `npx tsc -p tsconfig.node.json --noEmit && npx tsc -p tsconfig.web.json --noEmit`
Expected: clean.
Run: `npm run build`
Expected: exit 0.

- [ ] **Step 3: Packaged smoke test** — `npm run dist`, launch `dist/win-unpacked/Oh My Pi Desktop.exe` with `--remote-debugging-port=9222` (hub start, ready on port). Verify via CDP snapshot: app auto-connects to `~/omp-workspace` (no onboarding modal), composer enabled, right panel shows Todos tab; send a test prompt; after the turn, Files tab lists at least the file the agent touched; open it in the FileViewer.

- [ ] **Step 4: Commit + push**

```bash
git add -A
git commit -m "chore: v0.2.0 — Claude-style UI, default project, file viewer"
git push origin main
```

- [ ] **Step 5: Update the session record** — append a dated note to `docs/superpowers/session-record-2026-08-03-oh-my-pi-desktop.md` (or add `docs/superpowers/session-record-2026-08-03-v1.2.md`) summarizing what shipped and the verification evidence. Commit.

---

## Self-Review

**Spec coverage:**
1. Default project — Task 3 (IPC + defaultProjectDir) + Task 6 (launch flow + first-run toast) ✓
2. Claude-style layout — Task 6 (sidebar grouping/search, slim top bar) + Task 5 (right panel) ✓
3. Todos in-progress/finished — Task 5 (TodoPanel rework with status icons/pills) ✓
4. File viewer — Task 1 (tracking) + Task 3 (read IPC) + Task 5 (FilesPanel/FileViewer) ✓
5. Visual polish — Task 7 ✓
6. Error handling — read-file boundary/errors (Task 3), default-dir fallback toast (Task 6), session grouping null-mtime (Task 2) ✓
7. Testing — Tasks 1, 2, 3 (unit), 5 (component), 8 (full suite + smoke) ✓
8. Version 0.2.0 — Task 8 ✓

**Type consistency:** `FileRef` (Task 1) used in store (Task 4), FilesPanel/FileViewer (Task 5). `ReadFileResult` (Task 3, shared) used in main read-file.ts and preload/renderer. `groupSessionsByDay` (Task 2) → Sidebar (Task 6). `rightTab`/`sessionFiles`/`openFilePath`/`setRightTab`/`setOpenFile` consistent across Tasks 4–6.

**Placeholders:** none — every code step contains real code.

**Known deviation from spec:** `Onboarding.tsx` deleted (spec allowed "toast or delete"); glob-pattern values skipped at extraction (spec said "glob/grep-adjacent" — skipping patterns is the safe reading).
