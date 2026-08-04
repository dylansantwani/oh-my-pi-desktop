import { vi } from 'vitest'

// Renderer modules import src/renderer/src/api.ts at module load, which reads
// window.omp directly. jsdom tests need a stub installed before any import.
// Guarded so node-environment tests (the protocol suite) stay untouched.
if (typeof window !== 'undefined') {
  // jsdom does not implement scrollIntoView; the Transcript auto-scroll effect
  // calls it on mount. A no-op is the standard jsdom shim.
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal('omp', {
    connect: vi.fn(async () => ({ ok: true })),
    disconnect: vi.fn(async () => {}),
    getStatus: vi.fn(async () => ({ status: 'offline', project: null, pid: null })),
    pickProject: vi.fn(async () => null),
    recallProject: vi.fn(async () => null),
    rememberProject: vi.fn(async () => {}),
    defaultProject: vi.fn(async () => 'C:\\proj'),
    readFile: vi.fn(async () => ({ ok: true as const, content: '', size: 0 })),
    getOmpPath: vi.fn(async () => 'omp'),
    prompt: vi.fn(async () => undefined),
    steer: vi.fn(async () => undefined),
    followUp: vi.fn(async () => undefined),
    abort: vi.fn(async () => undefined),
    newSession: vi.fn(async () => undefined),
    switchSession: vi.fn(async () => undefined),
    renameSession: vi.fn(async () => undefined),
    exportHtml: vi.fn(async () => undefined),
    getState: vi.fn(async () => ({})),
    getModels: vi.fn(async () => ({ models: [] })),
    setModel: vi.fn(async () => undefined),
    setThinkingLevel: vi.fn(async () => undefined),
    setFastMode: vi.fn(async () => undefined),
    getMessagesPage: vi.fn(async () => ({ messages: [], nextCursor: null })),
    listSessions: vi.fn(async () => []),
    uiResponse: vi.fn(async () => undefined),
    onEvent: vi.fn(() => () => {}),
    onUiRequest: vi.fn(() => () => {}),
    onStatus: vi.fn(() => () => {}),
    onUpdateStatus: vi.fn(() => () => {}),
    installUpdate: vi.fn(async () => {})
  })
}
