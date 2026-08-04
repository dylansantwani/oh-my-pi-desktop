// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useAppStore } from '../../src/renderer/src/store'
import { RightPanel } from '../../src/renderer/src/components/RightPanel'
import type { TodoPhase } from '../../src/renderer/src/store'

const PHASES: TodoPhase[] = [
  {
    id: 'p1',
    name: 'Setup',
    tasks: [
      { id: 't1', content: 'Write spec', status: 'completed' },
      { id: 't2', content: 'Build UI', status: 'in_progress' },
      { id: 't3', content: 'Ship', status: 'pending' }
    ]
  }
]

describe('RightPanel', () => {
  beforeEach(() => {
    useAppStore.setState({ rightTab: 'todos', todos: PHASES, sessionFiles: [], openFilePath: null })
  })

  it('renders the Todos tab by default with phase progress', () => {
    render(<RightPanel />)
    expect(screen.getByText('Setup')).toBeTruthy()
    expect(screen.getByText('1/3')).toBeTruthy()
    expect(screen.getByText('Write spec')).toBeTruthy()
    expect(screen.getByText('Build UI')).toBeTruthy()
  })

  it('switches to the Files tab and shows its empty state', () => {
    render(<RightPanel />)
    fireEvent.click(screen.getByText('Files'))
    expect(screen.getByText(/files the agent touches/i)).toBeTruthy()
  })

  it('switches to the Context tab and shows the model controls', () => {
    render(<RightPanel />)
    fireEvent.click(screen.getByText('Context'))
    expect(screen.getByText('Model')).toBeTruthy()
    expect(screen.getByText('Thinking level')).toBeTruthy()
  })

  it('renders session files with a modified badge in the Files tab', () => {
    useAppStore.setState({
      sessionFiles: [
        { path: 'C:\\proj\\a.txt', name: 'a.txt', modified: true, firstSeenAt: 1 },
        { path: 'C:\\proj\\b.ts', name: 'b.ts', modified: false, firstSeenAt: 2 }
      ]
    })
    render(<RightPanel />)
    fireEvent.click(screen.getByText('Files'))
    expect(screen.getByText('a.txt')).toBeTruthy()
    expect(screen.getByText('edited')).toBeTruthy()
    expect(screen.getByText('b.ts')).toBeTruthy()
  })

  it('tracked tool events land in the store sessionFiles', () => {
    useAppStore.setState({ project: 'C:\\proj', sessionFiles: [] })
    // store.ts registers its event wiring through window.omp.onEvent at module
    // load — invoke the captured handler directly with a tool event.
    const handler = vi.mocked(window.omp.onEvent).mock.calls[0][0]
    handler({ type: 'tool_execution_start', toolCallId: 'x', name: 'read', args: { path: 'c.txt' } })
    expect(useAppStore.getState().sessionFiles.map((f) => f.name)).toEqual(['c.txt'])
  })
})
