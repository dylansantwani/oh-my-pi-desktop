// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { useAppStore } from '../../src/renderer/src/store'
import App from '../../src/renderer/src/App'
import type { MenuCommand } from '../../src/shared/omp-api'

const newSession = vi.fn(async () => {})
const pickProjectAndConnect = vi.fn(async () => {})
const exportHtml = vi.fn(async () => {})
const unsubscribe = vi.fn()

let handler: ((command: MenuCommand) => void) | null = null

/** Play the part of the main process: hand the renderer a command on the same
 *  channel the application menu emits on. */
function emit(command: MenuCommand): void {
  if (!handler) throw new Error('App never subscribed to menu commands')
  const fire = handler
  act(() => {
    fire(command)
  })
}

beforeEach(() => {
  handler = null
  newSession.mockClear()
  pickProjectAndConnect.mockClear()
  exportHtml.mockClear()
  unsubscribe.mockClear()
  vi.mocked(window.omp.onMenuCommand).mockImplementation((cb) => {
    handler = cb
    return unsubscribe
  })
  useAppStore.setState({
    status: 'connected',
    messages: [],
    paletteOpen: false,
    settingsOpen: false,
    rightPanelOpen: true,
    searchOpen: false,
    searchQuery: '',
    searchMatchIndex: 0,
    newSession,
    pickProjectAndConnect,
    exportHtml
  })
})

describe('menu commands', () => {
  it('new_session starts a fresh session', () => {
    render(<App />)
    emit('new_session')
    expect(newSession).toHaveBeenCalledTimes(1)
  })

  it('open_project opens the project picker', () => {
    render(<App />)
    emit('open_project')
    expect(pickProjectAndConnect).toHaveBeenCalledTimes(1)
  })

  it('export_html exports the session', () => {
    render(<App />)
    emit('export_html')
    expect(exportHtml).toHaveBeenCalledTimes(1)
  })

  it('command_palette toggles the palette both ways', () => {
    render(<App />)
    emit('command_palette')
    expect(useAppStore.getState().paletteOpen).toBe(true)
    expect(screen.getByPlaceholderText(/Type a command/)).toBeTruthy()
    emit('command_palette')
    expect(useAppStore.getState().paletteOpen).toBe(false)
    expect(screen.queryByPlaceholderText(/Type a command/)).toBeNull()
  })

  it('focus_composer focuses the composer textarea', () => {
    render(<App />)
    const ta = screen.getByPlaceholderText(/Message the agent/) as HTMLTextAreaElement
    ta.blur()
    expect(document.activeElement).not.toBe(ta)
    emit('focus_composer')
    expect(document.activeElement).toBe(ta)
  })

  it('focus_composer leaves a disconnected composer alone', () => {
    useAppStore.setState({ status: 'offline' })
    render(<App />)
    const ta = screen.getByPlaceholderText(/Connect to a project/) as HTMLTextAreaElement
    expect(ta.disabled).toBe(true)
    emit('focus_composer')
    expect(document.activeElement).not.toBe(ta)
  })

  it('toggle_right_panel hides and restores the right panel', () => {
    render(<App />)
    expect(document.querySelector('.right-panel')).toBeTruthy()
    emit('toggle_right_panel')
    expect(useAppStore.getState().rightPanelOpen).toBe(false)
    expect(document.querySelector('.right-panel')).toBeNull()
    emit('toggle_right_panel')
    expect(useAppStore.getState().rightPanelOpen).toBe(true)
    expect(document.querySelector('.right-panel')).toBeTruthy()
  })

  it('find_in_transcript opens the search bar', () => {
    render(<App />)
    expect(screen.queryByPlaceholderText(/Find in transcript/)).toBeNull()
    emit('find_in_transcript')
    expect(useAppStore.getState().searchOpen).toBe(true)
    expect(screen.getByPlaceholderText(/Find in transcript/)).toBeTruthy()
  })

  it('settings raises the flag the settings panel will hang off', () => {
    render(<App />)
    expect(useAppStore.getState().settingsOpen).toBe(false)
    emit('settings')
    expect(useAppStore.getState().settingsOpen).toBe(true)
  })

  it('unsubscribes from the channel on unmount', () => {
    const view = render(<App />)
    expect(unsubscribe).not.toHaveBeenCalled()
    view.unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})

describe('accelerator ownership', () => {
  it('leaves menu-declared chords to the menu so they fire once', () => {
    render(<App />)
    act(() => {
      fireEvent.keyDown(window, { key: 'n', ctrlKey: true })
      fireEvent.keyDown(window, { key: 'o', ctrlKey: true })
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    })
    expect(newSession).not.toHaveBeenCalled()
    expect(pickProjectAndConnect).not.toHaveBeenCalled()
    expect(useAppStore.getState().paletteOpen).toBe(false)
    emit('new_session')
    expect(newSession).toHaveBeenCalledTimes(1)
  })

  it('still handles Escape, which no menu item can claim', () => {
    render(<App />)
    emit('command_palette')
    expect(useAppStore.getState().paletteOpen).toBe(true)
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(useAppStore.getState().paletteOpen).toBe(false)
  })

  it('Escape dismisses only the topmost surface', () => {
    render(<App />)
    emit('command_palette')
    emit('find_in_transcript')
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(useAppStore.getState().searchOpen).toBe(false)
    expect(useAppStore.getState().paletteOpen).toBe(true)
  })
})
