// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { useAppStore } from '../../src/renderer/src/store'
import { SearchBar, SEARCH_DEBOUNCE_MS } from '../../src/renderer/src/components/SearchBar'
import { Transcript } from '../../src/renderer/src/components/Transcript'
import type { TranscriptMessage } from '../../src/renderer/src/lib/transcript'

function msg(id: string, text: string, role: 'user' | 'assistant' = 'assistant'): TranscriptMessage {
  return { id, role, text, thinking: '', toolCalls: [], complete: true }
}

// Three of the four match /widget/i, in three different casings.
const messages: TranscriptMessage[] = [
  msg('m1', 'Deploy the Widget service', 'user'),
  msg('m2', 'I looked at the widget config'),
  msg('m3', 'Nothing relevant in this one'),
  msg('m4', 'WIDGET rollout finished')
]

function input(): HTMLInputElement {
  return screen.getByPlaceholderText(/Find in transcript/) as HTMLInputElement
}

function type(value: string): void {
  act(() => {
    fireEvent.change(input(), { target: { value } })
  })
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  useAppStore.setState({ messages, searchOpen: true, searchQuery: '', searchMatchIndex: 0 })
})

afterEach(() => {
  vi.useRealTimers()
  useAppStore.setState({ messages: [], searchOpen: false, searchQuery: '', searchMatchIndex: 0 })
})

describe('SearchBar', () => {
  it('renders nothing while search is closed', () => {
    useAppStore.setState({ searchOpen: false })
    render(<SearchBar />)
    expect(screen.queryByPlaceholderText(/Find in transcript/)).toBeNull()
  })

  it('counts matching messages once typing settles', () => {
    render(<SearchBar />)
    type('widget')
    advance(SEARCH_DEBOUNCE_MS)
    expect(screen.getByText('1 of 3')).toBeTruthy()
  })

  it('matches case-insensitively', () => {
    render(<SearchBar />)
    type('WIDGET')
    advance(SEARCH_DEBOUNCE_MS)
    expect(useAppStore.getState().searchQuery).toBe('WIDGET')
    expect(screen.getByText('1 of 3')).toBeTruthy()
  })

  it('reports when nothing matches', () => {
    render(<SearchBar />)
    type('kubernetes')
    advance(SEARCH_DEBOUNCE_MS)
    expect(screen.getByText('No matches')).toBeTruthy()
    expect(screen.getByLabelText('Next match')).toHaveProperty('disabled', true)
  })

  describe('debounce', () => {
    it('holds the query until typing stops', () => {
      render(<SearchBar />)
      type('widget')
      advance(SEARCH_DEBOUNCE_MS - 1)
      expect(useAppStore.getState().searchQuery).toBe('')
      expect(screen.queryByText('1 of 3')).toBeNull()
      advance(1)
      expect(useAppStore.getState().searchQuery).toBe('widget')
    })

    it('re-scans once for a burst of keystrokes, not once per key', () => {
      render(<SearchBar />)
      for (const value of ['w', 'wi', 'wid', 'widg']) {
        type(value)
        advance(SEARCH_DEBOUNCE_MS - 20)
      }
      expect(useAppStore.getState().searchQuery).toBe('')
      advance(SEARCH_DEBOUNCE_MS)
      expect(useAppStore.getState().searchQuery).toBe('widg')
    })

    it('Enter flushes a pending query instead of waiting it out', () => {
      render(<SearchBar />)
      type('widget')
      act(() => {
        fireEvent.keyDown(input(), { key: 'Enter' })
      })
      expect(useAppStore.getState().searchQuery).toBe('widget')
      expect(screen.getByText('1 of 3')).toBeTruthy()
    })
  })

  describe('match navigation', () => {
    beforeEach(() => {
      render(<SearchBar />)
      type('widget')
      advance(SEARCH_DEBOUNCE_MS)
    })

    it('steps forward and wraps past the last match', () => {
      const next = screen.getByLabelText('Next match')
      act(() => {
        fireEvent.click(next)
      })
      expect(screen.getByText('2 of 3')).toBeTruthy()
      act(() => {
        fireEvent.click(next)
      })
      expect(screen.getByText('3 of 3')).toBeTruthy()
      act(() => {
        fireEvent.click(next)
      })
      expect(screen.getByText('1 of 3')).toBeTruthy()
    })

    it('steps backward and wraps before the first match', () => {
      act(() => {
        fireEvent.click(screen.getByLabelText('Previous match'))
      })
      expect(screen.getByText('3 of 3')).toBeTruthy()
      act(() => {
        fireEvent.click(screen.getByLabelText('Previous match'))
      })
      expect(screen.getByText('2 of 3')).toBeTruthy()
    })

    it('Enter is next and Shift+Enter is previous', () => {
      act(() => {
        fireEvent.keyDown(input(), { key: 'Enter' })
      })
      expect(screen.getByText('2 of 3')).toBeTruthy()
      act(() => {
        fireEvent.keyDown(input(), { key: 'Enter', shiftKey: true })
      })
      expect(screen.getByText('1 of 3')).toBeTruthy()
      act(() => {
        fireEvent.keyDown(input(), { key: 'Enter', shiftKey: true })
      })
      expect(screen.getByText('3 of 3')).toBeTruthy()
    })
  })

  it('closes on Escape and drops the query with it', () => {
    render(<SearchBar />)
    type('widget')
    advance(SEARCH_DEBOUNCE_MS)
    act(() => {
      fireEvent.keyDown(input(), { key: 'Escape' })
    })
    expect(useAppStore.getState().searchOpen).toBe(false)
    expect(useAppStore.getState().searchQuery).toBe('')
    expect(screen.queryByPlaceholderText(/Find in transcript/)).toBeNull()
  })

  it('closes from the close button', () => {
    render(<SearchBar />)
    act(() => {
      fireEvent.click(screen.getByLabelText('Close search'))
    })
    expect(useAppStore.getState().searchOpen).toBe(false)
  })
})

describe('Transcript search highlight', () => {
  it('marks every matching message and only the active one as active', () => {
    useAppStore.setState({ searchQuery: 'widget', searchMatchIndex: 0 })
    const { container } = render(<Transcript />)
    expect(container.querySelectorAll('.search-hit')).toHaveLength(3)
    const active = container.querySelectorAll('.search-hit-active')
    expect(active).toHaveLength(1)
    expect(active[0].textContent).toContain('Deploy the Widget service')
  })

  it('moves the active mark as the user steps through matches', () => {
    useAppStore.setState({ searchQuery: 'widget', searchMatchIndex: 0 })
    const { container } = render(<Transcript />)
    act(() => {
      useAppStore.getState().stepSearchMatch(1)
    })
    expect(container.querySelector('.search-hit-active')?.textContent).toContain('widget config')
    act(() => {
      useAppStore.getState().stepSearchMatch(1)
    })
    expect(container.querySelector('.search-hit-active')?.textContent).toContain('WIDGET rollout')
  })

  it('marks nothing while search is closed', () => {
    useAppStore.setState({ searchOpen: false, searchQuery: 'widget' })
    const { container } = render(<Transcript />)
    expect(container.querySelectorAll('.search-hit')).toHaveLength(0)
  })

  it('scrolls the active match into view', () => {
    useAppStore.setState({ searchQuery: 'widget', searchMatchIndex: 0 })
    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView)
    scrollIntoView.mockClear()
    render(<Transcript />)
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
  })
})
