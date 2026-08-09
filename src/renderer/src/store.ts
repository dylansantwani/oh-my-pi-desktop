import { create } from 'zustand'
import { api } from './api'
import { applyEvent, pushUserMessage, type TranscriptMessage } from './lib/transcript'
import { historyToTranscript } from './lib/history'
import { extractFileRefs, mergeFileRefs, type FileRef } from './lib/files'

export interface TodoTask { id: string; content: string; status: string }
export interface TodoPhase { id: string; name: string; tasks: TodoTask[] }

interface AppState {
  status: string
  project: string | null
  sessions: { path: string; title: string; cwd: string; mtimeMs: number; sizeBytes: number }[]
  activeSessionPath: string | null
  messages: TranscriptMessage[]
  nextCursor: string | null
  isStreaming: boolean
  uiRequest: Record<string, unknown> | null
  toasts: { id: number; text: string; kind: 'error' | 'info' }[]
  model: { provider: string; id: string; name?: string } | null
  thinkingLevel: string
  /** Populated once per connection. The Context panel used to fetch this into
   *  its own local state, so the composer's selector would have had a second,
   *  separately-timed copy of the same list. */
  models: { provider: string; id: string; name?: string; contextWindow?: number }[]
  fastMode: boolean
  contextUsage: { tokens: number; contextWindow: number; percent: number } | null
  tokensPerSecond: number | null
  sessionName: string
  todos: TodoPhase[]
  paletteOpen: boolean
  settingsOpen: boolean
  rightPanelOpen: boolean
  rightTab: 'todos' | 'files' | 'context'
  sessionFiles: FileRef[]
  openFilePath: string | null
  searchOpen: boolean
  searchQuery: string
  searchMatchIndex: number
  /** Last error the agent process reported. Unlike a toast this persists until
   *  dismissed or superseded — a missing/broken `omp` used to leave no trace
   *  after six seconds. */
  agentError: string | null
  /** False once the oldest page has been fetched — drives the "load older"
   *  control and stops it re-requesting page one. */
  canLoadOlder: boolean
  loadingOlder: boolean
  dismissAgentError: () => void
  sendPrompt: (text: string) => Promise<void>
  abort: () => Promise<void>
  steer: (text: string) => Promise<void>
  followUp: (text: string) => Promise<void>
  refreshState: () => Promise<void>
  setModel: (provider: string, id: string) => Promise<void>
  setThinkingLevel: (level: string) => Promise<void>
  setFastMode: (enabled: boolean) => Promise<void>
  refreshModels: () => Promise<void>
  refreshSessions: () => Promise<void>
  pickProjectAndConnect: () => Promise<void>
  connect: (project: string) => Promise<void>
  switchSession: (path: string) => Promise<void>
  newSession: () => Promise<void>
  renameSession: (name: string) => Promise<void>
  exportHtml: () => Promise<void>
  setPaletteOpen: (open: boolean) => Promise<void>
  setSettingsOpen: (open: boolean) => void
  toggleRightPanel: () => void
  setRightTab: (tab: 'todos' | 'files' | 'context') => void
  setOpenFile: (path: string | null) => void
  setSearchOpen: (open: boolean) => void
  setSearchQuery: (query: string) => void
  stepSearchMatch: (delta: number) => void
  loadOlder: () => Promise<void>
  answerUi: (id: string, value: unknown, confirmed?: boolean, cancelled?: boolean) => Promise<void>
  toast: (text: string, kind?: 'error' | 'info') => void
}

let toastSeq = 0

/** ipcRenderer.invoke wraps every rejection as
 *  "Error invoking remote method 'omp:prompt': Error: Agent not connected".
 *  Main normalises the tail, but the wrapper is added inside invoke itself, so
 *  only the renderer can take it off — and none of it is anything a user should
 *  be asked to read. */
function errText(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  return raw.replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^Error:\s*/, '').trim()
}

/** Ids of the transcript messages matching `query`, in transcript order.
 *  Case-insensitive substring, and only over `text`: `thinking` lives behind a
 *  collapsed <details> and tool-call args/results inside their own collapsible
 *  cards, so a hit in either could never be revealed or scrolled to from the
 *  search bar — counting it would just make "n of m" lie. */
export function searchMatches(messages: TranscriptMessage[], query: string): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const ids: string[] = []
  for (const m of messages) {
    if (m.text.toLowerCase().includes(q)) ids.push(m.id)
  }
  return ids
}

export const useAppStore = create<AppState>((set, get) => ({
  status: 'offline',
  project: null,
  sessions: [],
  activeSessionPath: null,
  messages: [],
  nextCursor: null,
  isStreaming: false,
  uiRequest: null,
  toasts: [],
  model: null,
  thinkingLevel: 'medium',
  models: [],
  fastMode: false,
  contextUsage: null,
  tokensPerSecond: null,
  sessionName: '',
  todos: [],
  paletteOpen: false,
  settingsOpen: false,
  rightPanelOpen: true,
  rightTab: 'todos',
  sessionFiles: [],
  openFilePath: null,
  searchOpen: false,
  searchQuery: '',
  searchMatchIndex: 0,
  agentError: null,
  canLoadOlder: false,
  loadingOlder: false,

  dismissAgentError: () => set({ agentError: null }),

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
      get().toast(`Prompt failed: ${errText(e)}`, 'error')
    }
  },

  abort: async () => {
    try {
      await api.abort()
    } catch (e) {
      get().toast(`Abort failed: ${errText(e)}`, 'error')
    }
  },

  steer: async (text) => {
    try {
      await api.steer(text.trim())
    } catch (e) {
      get().toast(`Steer failed: ${errText(e)}`, 'error')
    }
  },

  followUp: async (text) => {
    try {
      await api.followUp(text.trim())
    } catch (e) {
      get().toast(`Follow-up failed: ${errText(e)}`, 'error')
    }
  },

  refreshState: async () => {
    try {
      const st = (await api.getState()) as {
        model?: { provider: string; id: string }
        thinkingLevel?: string
        contextUsage?: { tokens: number; contextWindow: number; percent: number }
        tokensPerSecond?: number | null
        fastModeEnabled?: boolean
        fastModeActive?: boolean
        sessionName?: string
        isStreaming?: boolean
      }
      set({
        model: st.model ?? null,
        thinkingLevel: st.thinkingLevel ?? get().thinkingLevel,
        contextUsage: st.contextUsage ?? null,
        tokensPerSecond: st.tokensPerSecond ?? null,
        fastMode: st.fastModeEnabled ?? st.fastModeActive ?? false,
        sessionName: st.sessionName ?? get().sessionName,
        // The agent knows whether a turn is actually running. Deriving this only
        // from agent_start/agent_end meant a single missed end event stranded the
        // UI mid-turn — the streaming dot pulsing over an idle, empty chat, with
        // the empty state suppressed behind it. Every refresh now reconciles.
        isStreaming: typeof st.isStreaming === 'boolean' ? st.isStreaming : get().isStreaming
      })
    } catch {
      /* not connected yet — ignore */
    }
  },

  setModel: async (provider, id) => {
    try {
      await api.setModel(provider, id)
      // Carry the friendly name over from the catalogue so the selector's label
      // doesn't drop back to a raw id until the next get_state lands.
      const known = get().models.find((m) => m.provider === provider && m.id === id)
      set({ model: { provider, id, name: known?.name } })
    } catch (e) {
      get().toast(`Model change failed: ${errText(e)}`, 'error')
    }
  },

  setThinkingLevel: async (level) => {
    try {
      await api.setThinkingLevel(level)
      set({ thinkingLevel: level })
    } catch (e) {
      get().toast(`Thinking level failed: ${errText(e)}`, 'error')
    }
  },

  setFastMode: async (enabled) => {
    try {
      await api.setFastMode(enabled)
      set({ fastMode: enabled })
    } catch (e) {
      get().toast(`Fast mode failed: ${errText(e)}`, 'error')
    }
  },

  refreshModels: async () => {
    try {
      const data = (await api.getModels()) as
        | { models?: { provider: string; id: string; name?: string; contextWindow?: number }[] }
        | { provider: string; id: string }[]
      const list = Array.isArray(data) ? data : Array.isArray(data.models) ? data.models : []
      set({ models: list })
    } catch {
      /* not connected yet — the selector falls back to the active model */
    }
  },

  refreshSessions: async () => {
    const { project } = get()
    if (!project) return
    try {
      const sessions = await api.listSessions(project)
      set({ sessions })
    } catch (e) {
      get().toast(`Session list failed: ${errText(e)}`, 'error')
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
    window.omp.rememberProject(project).catch((e) => {
      get().toast(`Couldn't remember project: ${errText(e)}`, 'error')
    })
    await get().refreshSessions()
  },

  switchSession: async (path) => {
    // Re-selecting the open session used to re-issue the RPC and reload its
    // whole history. Rename opens by activating a row, so this runs on every
    // double-click too.
    if (get().activeSessionPath === path) return
    try {
      await api.switchSession(path)
      // Todos, the session name and context usage all belong to the session
      // being left; keeping them meant the right panel showed the previous
      // session's plan, and the Context tab's name field would rename the new
      // session to the old title on the next blur.
      set({
        activeSessionPath: path,
        messages: [],
        isStreaming: false,
        nextCursor: null,
        sessionFiles: [],
        openFilePath: null,
        todos: [],
        sessionName: '',
        contextUsage: null,
        tokensPerSecond: null,
        canLoadOlder: true
      })
      await get().loadOlder()
      await get().refreshState()
    } catch (e) {
      get().toast(`Switch failed: ${errText(e)}`, 'error')
    }
  },

  newSession: async () => {
    try {
      await api.newSession()
      set({
        activeSessionPath: null,
        messages: [],
        isStreaming: false,
        sessionName: '',
        nextCursor: null,
        sessionFiles: [],
        openFilePath: null,
        todos: [],
        // Cleared because they describe the session being left — but a new
        // session still has a context window and a system prompt in it, so the
        // readout has to be refetched below rather than left blank.
        contextUsage: null,
        tokensPerSecond: null,
        canLoadOlder: false
      })
      await get().refreshState()
    } catch (e) {
      get().toast(`New session failed: ${errText(e)}`, 'error')
    }
  },

  renameSession: async (name) => {
    try {
      await api.renameSession(name)
      set({ sessionName: name })
      void get().refreshSessions()
    } catch (e) {
      get().toast(`Rename failed: ${errText(e)}`, 'error')
    }
  },

  exportHtml: async () => {
    try {
      await api.exportHtml()
      get().toast('Session exported to HTML', 'info')
    } catch (e) {
      get().toast(`Export failed: ${errText(e)}`, 'error')
    }
  },

  setPaletteOpen: async (open) => {
    set({ paletteOpen: open })
  },

  // No settings surface exists yet — the flag is here so the menu's
  // Preferences item is already wired when that panel lands.
  setSettingsOpen: (open) => set({ settingsOpen: open }),

  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),

  setRightTab: (tab) => set({ rightTab: tab }),

  setOpenFile: (path) => set({ openFilePath: path }),

  setSearchOpen: (open) =>
    // Closing drops the query too, so the transcript highlight goes with the
    // bar and reopening always starts from a clean slate.
    set(open ? { searchOpen: true, searchMatchIndex: 0 } : { searchOpen: false, searchQuery: '', searchMatchIndex: 0 }),

  setSearchQuery: (query) => {
    // The debounce can land on a query that was already flushed by Enter;
    // re-setting it would silently rewind the user's position to match 1.
    if (get().searchQuery === query) return
    set({ searchQuery: query, searchMatchIndex: 0 })
  },

  stepSearchMatch: (delta) => {
    const total = searchMatches(get().messages, get().searchQuery).length
    if (total === 0) {
      set({ searchMatchIndex: 0 })
      return
    }
    // Wrap both ways: next past the last hit returns to the first, prev from
    // the first lands on the last. `% ` alone gives negatives in JS.
    set((s) => ({ searchMatchIndex: (((s.searchMatchIndex + delta) % total) + total) % total }))
  },

  loadOlder: async () => {
    // Nothing called this a second time before, so `nextCursor` was written and
    // never read and anything past the first 100 messages was unreachable. Now
    // the transcript offers a "load older" control, so guard against both
    // re-fetching page one and overlapping requests.
    const { nextCursor, canLoadOlder, loadingOlder } = get()
    if (!canLoadOlder || loadingOlder) return
    set({ loadingOlder: true })
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
        nextCursor: page.nextCursor ?? null,
        canLoadOlder: page.nextCursor != null
      }))
    } catch (e) {
      get().toast(`History load failed: ${errText(e)}`, 'error')
    } finally {
      set({ loadingOlder: false })
    }
  },

  answerUi: async (id, value, confirmed, cancelled) => {
    try {
      await api.uiResponse(id, value, confirmed, cancelled)
    } catch (e) {
      get().toast(`UI response failed: ${errText(e)}`, 'error')
    } finally {
      set({ uiRequest: null })
    }
  }
}))

// Event wiring: attach once at module load.
let wasReconnecting = false
api.onStatus((status) => {
  if (status === 'reconnecting') wasReconnecting = true
  if (status === 'connected' && wasReconnecting) {
    wasReconnecting = false
    useAppStore.getState().toast('Reconnected to the agent')
  }
  // An agent that dies mid-turn never sends agent_end, so isStreaming stayed
  // true forever: the composer kept showing Queue/Interrupt/Abort, Enter routed
  // to followUp against a fresh process, and the "no reply" recovery hint was
  // suppressed because it requires !isStreaming. Losing the connection ends the
  // turn by definition.
  const lost = status !== 'connected'
  useAppStore.setState(lost ? { status, isStreaming: false } : { status })
  if (status === 'connected') {
    useAppStore.setState({ agentError: null })
    void useAppStore.getState().refreshState()
    void useAppStore.getState().refreshModels()
  }
})
api.onAgentError(({ message }) => {
  useAppStore.setState({ agentError: message })
})
api.onEvent((frame) => {
  const s = useAppStore.getState()
  const type = frame.type as string
  if (type === 'agent_start' || type === 'turn_start') useAppStore.setState({ isStreaming: true })
  if (type === 'agent_end' || type === 'turn_end') useAppStore.setState({ isStreaming: false })
  if (type === 'todo_reminder' || type === 'todo_auto_clear') {
    const phases = Array.isArray((frame as { phases?: unknown }).phases)
      ? (frame as { phases: TodoPhase[] }).phases
      : Array.isArray((frame as { todos?: unknown }).todos)
        ? (frame as { todos: TodoPhase[] }).todos
        : []
    useAppStore.setState({ todos: phases })
  }
  if (type === 'tool_execution_start') {
    const project = useAppStore.getState().project
    if (project) {
      const refs = extractFileRefs(frame, project)
      if (refs.length > 0) {
        useAppStore.setState((prev) => ({ sessionFiles: mergeFileRefs(prev.sessionFiles, refs) }))
      }
    }
  }
  if (type === 'model_changed') useAppStore.setState({ model: (frame as { model?: { provider: string; id: string } }).model ?? null })
  if (type === 'thinking_level_changed') useAppStore.setState({ thinkingLevel: String((frame as { level?: string }).level ?? s.thinkingLevel) })
  if (type === 'notice') s.toast(String((frame as { message?: string }).message ?? 'notice'), 'info')
  // NOTE (Task 4 fixes): real omp frames that must reach the reducer —
  //   * agent_start/turn_start/message_start: open the assistant message
  //     (without this the message is never created and every delta is dropped);
  //   * agent_end: completes the open message for turns where message_end
  //     never fires, so the next prompt doesn't merge into the previous turn.
  if (type === 'agent_start' || type === 'turn_start' || type === 'message_start' || type === 'message_update' || type === 'tool_execution_start' || type === 'tool_execution_update' || type === 'tool_execution_end' || type === 'message_end' || type === 'agent_end') {
    useAppStore.setState((prev) => ({ messages: applyEvent(prev.messages, frame) }))
  }
})
// omp also pushes non-dialog extension UI (e.g. setWidget for its status
// widgets) through the same channel — only methods that render as a dialog
// belong in uiRequest. Anything else is absorbed so it can't pop a stray
// modal on connect.
const DIALOG_METHODS: Record<string, true> = { confirm: true, select: true, input: true, editor: true, notify: true }
api.onUiRequest((req) => {
  let method: unknown
  if (req && typeof req === 'object' && 'method' in req) method = req.method
  if (typeof method === 'string' && !DIALOG_METHODS[method]) return
  useAppStore.setState({ uiRequest: req })
})
