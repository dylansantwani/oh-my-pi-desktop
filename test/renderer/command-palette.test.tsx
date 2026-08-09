// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { useAppStore } from '../../src/renderer/src/store'
import { CommandPalette } from '../../src/renderer/src/components/CommandPalette'
import App from '../../src/renderer/src/App'
import type { MenuCommand } from '../../src/shared/omp-api'

const newSession = vi.fn(async () => {})
const switchSession = vi.fn(async () => {})
const exportHtml = vi.fn(async () => {})

beforeEach(() => {
  newSession.mockClear()
  switchSession.mockClear()
  exportHtml.mockClear()
  useAppStore.setState({
    paletteOpen: false,
    sessions: [
      { path: 'C:/proj/a.jsonl', title: 'Fix the spawn bug', cwd: 'C:/proj', mtimeMs: 1, sizeBytes: 10 },
      { path: 'C:/proj/b.jsonl', title: 'Polish the UI', cwd: 'C:/proj', mtimeMs: 2, sizeBytes: 20 }
    ],
    newSession,
    switchSession,
    exportHtml
  })
})

describe('CommandPalette', () => {
  it('renders nothing when closed', () => {
    render(<CommandPalette />)
    expect(screen.queryByPlaceholderText(/Type a command/)).toBeNull()
  })

  it('shows actions and sessions when open', () => {
    useAppStore.setState({ paletteOpen: true })
    render(<CommandPalette />)
    expect(screen.getByText('New session')).toBeTruthy()
    expect(screen.getByText('Fix the spawn bug')).toBeTruthy()
    expect(screen.getByText('Polish the UI')).toBeTruthy()
  })

  it('filters items by query', () => {
    useAppStore.setState({ paletteOpen: true })
    render(<CommandPalette />)
    const input = screen.getByPlaceholderText(/Type a command/) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'polish' } })
    expect(screen.queryByText('New session')).toBeNull()
    expect(screen.getByText('Polish the UI')).toBeTruthy()
  })

  it('executes the selected action with Enter', () => {
    useAppStore.setState({ paletteOpen: true })
    render(<CommandPalette />)
    const input = screen.getByPlaceholderText(/Type a command/) as HTMLInputElement
    fireEvent.keyDown(input, { key: 'ArrowDown' }) // move off 'New session'? actions are first
    fireEvent.keyDown(input, { key: 'ArrowUp' }) // back to first action
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(newSession).toHaveBeenCalled()
  })

  it('runs an action by click', () => {
    useAppStore.setState({ paletteOpen: true })
    render(<CommandPalette />)
    fireEvent.click(screen.getByText('Export session to HTML'))
    expect(exportHtml).toHaveBeenCalled()
  })

  it('switches session from the sessions group', () => {
    useAppStore.setState({ paletteOpen: true })
    render(<CommandPalette />)
    fireEvent.click(screen.getByText('Fix the spawn bug'))
    expect(switchSession).toHaveBeenCalledWith('C:/proj/a.jsonl')
  })

  it('closes on Escape', () => {
    useAppStore.setState({ paletteOpen: true })
    render(<CommandPalette />)
    const input = screen.getByPlaceholderText(/Type a command/) as HTMLInputElement
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(useAppStore.getState().paletteOpen).toBe(false)
    expect(screen.queryByPlaceholderText(/Type a command/)).toBeNull()
  })
})

/** Cmd/Ctrl+K is declared by the application menu now, so the shortcut reaches
 *  the renderer as a menu command rather than as a keydown. */
function togglePalette(command: MenuCommand = 'command_palette'): void {
  const cb = vi.mocked(window.omp.onMenuCommand).mock.calls.at(-1)?.[0]
  if (!cb) throw new Error('App never subscribed to menu commands')
  act(() => {
    cb(command)
  })
}

describe('global shortcuts', () => {
  it('the palette shortcut toggles it from anywhere in the app', () => {
    render(<App />)
    expect(screen.queryByPlaceholderText(/Type a command/)).toBeNull()
    togglePalette()
    expect(screen.getByPlaceholderText(/Type a command/)).toBeTruthy()
    togglePalette()
    expect(screen.queryByPlaceholderText(/Type a command/)).toBeNull()
  })

  it('Escape closes the palette', () => {
    render(<App />)
    togglePalette()
    expect(screen.getByPlaceholderText(/Type a command/)).toBeTruthy()
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(screen.queryByPlaceholderText(/Type a command/)).toBeNull()
  })
})
