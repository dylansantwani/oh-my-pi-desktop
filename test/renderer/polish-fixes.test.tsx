// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { useAppStore } from '../../src/renderer/src/store'
import { Sidebar } from '../../src/renderer/src/components/Sidebar'
import { Transcript } from '../../src/renderer/src/components/Transcript'
import { StatusBar } from '../../src/renderer/src/components/StatusBar'
import { UiRequestModal } from '../../src/renderer/src/components/UiRequestModal'
import { ToolCallCard } from '../../src/renderer/src/components/ToolCallCard'

// Several tests below swap store *actions* for spies via setState, which
// replaces the real implementation for every later test in the file. Capture
// the genuine ones up front so the suites that exercise real behaviour can put
// them back.
const REAL_ACTIONS = {
  switchSession: useAppStore.getState().switchSession,
  loadOlder: useAppStore.getState().loadOlder,
  answerUi: useAppStore.getState().answerUi
}
const REAL_REFRESH = useAppStore.getState().refreshState

const now = Date.now()
const SESSIONS = [
  { path: '/s/open.jsonl', title: 'Currently open', cwd: '/p', mtimeMs: now, sizeBytes: 1 },
  { path: '/s/other.jsonl', title: 'Some other session', cwd: '/p', mtimeMs: now, sizeBytes: 1 }
]

describe('renaming a session targets the session that was double-clicked', () => {
  it('activates the row before opening the editor, so the rename cannot land on the open session', async () => {
    const calls: string[] = []
    const switchSession = vi.fn(async (path: string) => {
      calls.push(`switch:${path}`)
      useAppStore.setState({ activeSessionPath: path })
    })
    const renameSession = vi.fn(async (name: string) => {
      calls.push(`rename:${name}`)
    })
    useAppStore.setState({
      project: '/p',
      sessions: SESSIONS,
      // The open session is NOT the one about to be renamed — this is exactly
      // the case that used to retitle the wrong session.
      activeSessionPath: '/s/open.jsonl',
      isStreaming: false,
      switchSession,
      renameSession,
      refreshSessions: vi.fn(async () => {})
    })

    render(<Sidebar />)
    fireEvent.doubleClick(screen.getByText('Some other session'))

    const input = await waitFor(() => screen.getByLabelText(/Rename session/i))
    fireEvent.change(input, { target: { value: 'New title' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(renameSession).toHaveBeenCalledWith('New title'))
    expect(calls).toEqual(['switch:/s/other.jsonl', 'rename:New title'])
  })

  it('renames from the keyboard with F2, which double-click cannot express', async () => {
    const switchSession = vi.fn(async () => {})
    useAppStore.setState({
      project: '/p',
      sessions: SESSIONS,
      activeSessionPath: '/s/other.jsonl',
      switchSession,
      renameSession: vi.fn(async () => {}),
      refreshSessions: vi.fn(async () => {})
    })
    render(<Sidebar />)
    fireEvent.keyDown(screen.getByText('Some other session').closest('.session-item') as HTMLElement, { key: 'F2' })
    expect(await waitFor(() => screen.getByLabelText(/Rename session/i))).toBeTruthy()
  })

  it('exposes rows as selectable options rather than click-only divs', () => {
    useAppStore.setState({
      project: '/p',
      sessions: SESSIONS,
      activeSessionPath: '/s/open.jsonl',
      switchSession: vi.fn(async () => {}),
      refreshSessions: vi.fn(async () => {})
    })
    render(<Sidebar />)
    const rows = screen.getAllByRole('option')
    expect(rows).toHaveLength(2)
    expect(rows[0].getAttribute('aria-selected')).toBe('true')
    expect(rows[0].getAttribute('tabindex')).toBe('0')
  })
})

describe('switchSession', () => {
  beforeEach(() => {
    useAppStore.setState({
      ...REAL_ACTIONS,
      activeSessionPath: null,
      todos: [{ id: 'p1', name: 'Old plan', tasks: [] }],
      sessionName: 'Old name',
      contextUsage: { tokens: 10, contextWindow: 100, percent: 0.1 }
    })
  })

  it('drops the previous session todos, name and context usage', async () => {
    await act(async () => {
      await useAppStore.getState().switchSession('/s/new.jsonl')
    })
    const s = useAppStore.getState()
    expect(s.todos).toEqual([])
    expect(s.sessionName).toBe('')
    expect(s.contextUsage).toBeNull()
  })

  it('is a no-op when the session is already open', async () => {
    useAppStore.setState({ activeSessionPath: '/s/same.jsonl', todos: [{ id: 'p1', name: 'Keep', tasks: [] }] })
    await act(async () => {
      await useAppStore.getState().switchSession('/s/same.jsonl')
    })
    expect(useAppStore.getState().todos).toHaveLength(1)
  })
})

describe('losing the agent ends the turn', () => {
  // The store subscribes at module load; the setup stub captured the handler.
  const onStatusMock = window.omp.onStatus as unknown as { mock: { calls: Array<Array<(s: string) => void>> } }
  const statusHandler = onStatusMock.mock.calls[0][0]

  it('clears isStreaming when the connection drops, so the composer unlocks', () => {
    useAppStore.setState({ isStreaming: true })
    act(() => statusHandler('reconnecting'))
    expect(useAppStore.getState().isStreaming).toBe(false)
    expect(useAppStore.getState().status).toBe('reconnecting')
  })

  it('leaves isStreaming alone while connected', () => {
    useAppStore.setState({ isStreaming: true })
    act(() => statusHandler('connected'))
    expect(useAppStore.getState().isStreaming).toBe(true)
  })
})

describe('StatusBar', () => {
  it('shows tokens against the context window rather than a count over a percentage', () => {
    useAppStore.setState({
      status: 'connected',
      contextUsage: { tokens: 48213, contextWindow: 200000, percent: 0.24 },
      tokensPerSecond: null,
      isStreaming: false,
      agentError: null
    })
    render(<StatusBar />)
    expect(screen.getByText(/context 48\.2K \/ 200K · 24%/)).toBeTruthy()
  })

  it('surfaces a persistent agent error with a route into settings', () => {
    useAppStore.setState({ status: 'offline', contextUsage: null, agentError: 'omp: missing API key' })
    render(<StatusBar />)
    expect(screen.getByRole('alert').textContent).toContain('missing API key')
    fireEvent.click(screen.getByLabelText('Dismiss agent error'))
    expect(useAppStore.getState().agentError).toBeNull()
  })
})

describe('UiRequestModal', () => {
  beforeEach(() => {
    useAppStore.setState({ uiRequest: null })
  })

  it('cancels on Escape — previously the dialog could not be dismissed by keyboard at all', () => {
    const answerUi = vi.fn(async () => {})
    useAppStore.setState({
      answerUi,
      uiRequest: { id: 'r1', method: 'confirm', title: 'Run command?', message: 'do a thing' }
    })
    render(<UiRequestModal />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(answerUi).toHaveBeenCalledWith('r1', undefined, false, true)
  })

  it('moves focus into the dialog so Enter cannot reach the composer behind it', () => {
    useAppStore.setState({
      answerUi: vi.fn(async () => {}),
      uiRequest: { id: 'r2', method: 'confirm', title: 'Run command?', message: 'do a thing' }
    })
    render(<UiRequestModal />)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Allow' }))
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true')
  })

  it('renders an indented command as code, not as prose', () => {
    useAppStore.setState({
      answerUi: vi.fn(async () => {}),
      uiRequest: {
        id: 'r3',
        method: 'confirm',
        title: 'Run command?',
        message: 'The agent wants to run:\n\n  rm -rf ./dist\n\nin /tmp/p'
      }
    })
    const { container } = render(<UiRequestModal />)
    const pre = container.querySelector('pre.modal-code')
    expect(pre?.textContent).toBe('rm -rf ./dist')
  })
})

describe('ToolCallCard', () => {
  it('names the file on the collapsed row instead of only the tool', () => {
    render(<ToolCallCard tool={{ id: 't1', name: 'read', args: { path: 'src/main/index.ts' }, status: 'ok' }} />)
    expect(screen.getByText('src/main/index.ts')).toBeTruthy()
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false')
  })

  it('summarises a shell tool by its command', () => {
    render(<ToolCallCard tool={{ id: 't2', name: 'bash', args: { command: 'npm test' }, status: 'running' }} />)
    expect(screen.getByText('npm test')).toBeTruthy()
  })
})

describe('Transcript history paging', () => {
  it('offers a load-older control once the store reports more history', async () => {
    const loadOlder = vi.fn(async () => {})
    useAppStore.setState({
      messages: [],
      isStreaming: false,
      searchOpen: false,
      activeSessionPath: '/s/a.jsonl',
      canLoadOlder: true,
      loadingOlder: false,
      loadOlder
    })
    render(<Transcript />)
    fireEvent.click(screen.getByText('Load older messages'))
    await waitFor(() => expect(loadOlder).toHaveBeenCalled())
  })

  it('hides the control when the oldest page has been reached', () => {
    useAppStore.setState({ messages: [], isStreaming: false, searchOpen: false, canLoadOlder: false })
    render(<Transcript />)
    expect(screen.queryByText('Load older messages')).toBeNull()
  })
})

describe('the streaming indicator cannot get stranded', () => {
  beforeEach(() => {
    useAppStore.setState({ ...REAL_ACTIONS, refreshState: REAL_REFRESH })
  })

  it('reconciles isStreaming from the agent instead of trusting events alone', async () => {
    // A missed agent_end used to leave this true forever: the dot pulsing over
    // an idle chat with the empty state suppressed behind it.
    useAppStore.setState({ isStreaming: true })
    ;(window.omp.getState as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce({
      isStreaming: false
    })
    await act(async () => {
      await useAppStore.getState().refreshState()
    })
    expect(useAppStore.getState().isStreaming).toBe(false)
  })

  it('believes the agent when a turn really is running', async () => {
    useAppStore.setState({ isStreaming: false })
    ;(window.omp.getState as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce({
      isStreaming: true
    })
    await act(async () => {
      await useAppStore.getState().refreshState()
    })
    expect(useAppStore.getState().isStreaming).toBe(true)
  })

  it('shows a labelled waiting state, not a bare dot, when a turn starts with no messages', () => {
    useAppStore.setState({ messages: [], isStreaming: true, searchOpen: false, canLoadOlder: false })
    const { container } = render(<Transcript />)
    expect(screen.getByText(/Waiting for the agent/)).toBeTruthy()
    expect(container.querySelector('.streaming-dot')).toBeNull()
  })
})
