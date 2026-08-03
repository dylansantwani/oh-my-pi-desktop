import { create } from 'zustand'
import { api } from './api'
import { applyEvent, pushUserMessage, type TranscriptMessage } from './lib/transcript'
import { historyToTranscript } from './lib/history'

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
  model: { provider: string; id: string } | null
  thinkingLevel: string
  models: { provider: string; id: string }[]
  fastMode: boolean
  contextUsage: { tokens: number; contextWindow: number; percent: number } | null
  tokensPerSecond: number | null
  sessionName: string
  todos: TodoPhase[]
  sendPrompt: (text: string) => Promise<void>
  abort: () => Promise<void>
  steer: (text: string) => Promise<void>
  followUp: (text: string) => Promise<void>
  refreshState: () => Promise<void>
  setModel: (provider: string, id: string) => Promise<void>
  setThinkingLevel: (level: string) => Promise<void>
  setFastMode: (enabled: boolean) => Promise<void>
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
    void window.omp.rememberProject(project)
    await get().refreshSessions()
  },

  switchSession: async (path) => {
    try {
      await api.switchSession(path)
      set({ activeSessionPath: path, messages: [], isStreaming: false, nextCursor: null })
      await get().loadOlder()
    } catch (e) {
      get().toast(`Switch failed: ${(e as Error).message}`, 'error')
    }
  },

  newSession: async () => {
    try {
      await api.newSession()
      set({ activeSessionPath: null, messages: [], isStreaming: false, sessionName: '', nextCursor: null })
    } catch (e) {
      get().toast(`New session failed: ${(e as Error).message}`, 'error')
    }
  },

  renameSession: async (name) => {
    try {
      await api.renameSession(name)
      set({ sessionName: name })
      void get().refreshSessions()
    } catch (e) {
      get().toast(`Rename failed: ${(e as Error).message}`, 'error')
    }
  },

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

  answerUi: async (id, value, confirmed, cancelled) => {
    try {
      await api.uiResponse(id, value, confirmed, cancelled)
    } catch (e) {
      get().toast(`UI response failed: ${(e as Error).message}`, 'error')
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
  useAppStore.setState({ status })
  if (status === 'connected') void useAppStore.getState().refreshState()
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
api.onUiRequest((req) => useAppStore.setState({ uiRequest: req }))
