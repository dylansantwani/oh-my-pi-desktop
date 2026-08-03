// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { useAppStore } from '../../src/renderer/src/store'
import { Transcript } from '../../src/renderer/src/components/Transcript'
import type { TranscriptMessage } from '../../src/renderer/src/lib/transcript'

const userMsg: TranscriptMessage = { id: 'u1', role: 'user', text: 'hi', thinking: '', toolCalls: [], complete: true }
const replyMsg: TranscriptMessage = { id: 'a1', role: 'assistant', text: 'hello back', thinking: '', toolCalls: [], complete: true }

describe('Transcript recovery hint', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useAppStore.setState({ messages: [], isStreaming: false })
  })

  afterEach(() => {
    vi.useRealTimers()
    useAppStore.setState({ messages: [] })
  })

  it('is hidden immediately after a user bubble, then appears after the 1.2s debounce', () => {
    useAppStore.setState({ messages: [userMsg] })
    render(<Transcript />)
    expect(screen.queryByText(/didn't reply/i)).toBeNull()
    act(() => {
      vi.advanceTimersByTime(1200)
    })
    expect(screen.getByText(/didn't reply/i)).toBeTruthy()
  })

  it('disappears once the agent answers', () => {
    useAppStore.setState({ messages: [userMsg] })
    render(<Transcript />)
    act(() => {
      vi.advanceTimersByTime(1200)
    })
    expect(screen.getByText(/didn't reply/i)).toBeTruthy()
    act(() => {
      useAppStore.setState({ messages: [userMsg, replyMsg] })
      vi.advanceTimersByTime(1200)
    })
    expect(screen.queryByText(/didn't reply/i)).toBeNull()
  })

  it('never shows while the agent is streaming a reply', () => {
    useAppStore.setState({ messages: [userMsg], isStreaming: true })
    render(<Transcript />)
    act(() => {
      vi.advanceTimersByTime(1200)
    })
    expect(screen.queryByText(/didn't reply/i)).toBeNull()
  })

  it('does not show when the last message is an assistant reply', () => {
    useAppStore.setState({ messages: [userMsg, replyMsg] })
    render(<Transcript />)
    act(() => {
      vi.advanceTimersByTime(1200)
    })
    expect(screen.queryByText(/didn't reply/i)).toBeNull()
  })
})
