// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useAppStore } from '../../src/renderer/src/store'
import { MessageView } from '../../src/renderer/src/components/MessageView'
import App from '../../src/renderer/src/App'
import type { TranscriptMessage } from '../../src/renderer/src/lib/transcript'

const userMsg: TranscriptMessage = { id: 'u1', role: 'user', text: 'my question', thinking: '', toolCalls: [], complete: true }
const replyMsg: TranscriptMessage = { id: 'a1', role: 'assistant', text: 'the answer', thinking: '', toolCalls: [], complete: true }

describe('MessageView copy button', () => {
  const writeText = vi.fn(async () => {})

  beforeEach(() => {
    writeText.mockClear()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  })

  afterEach(() => {
    useAppStore.setState({ messages: [] })
  })

  it('copies the user message text', () => {
    render(<MessageView message={userMsg} />)
    fireEvent.click(screen.getByTitle('Copy message'))
    expect(writeText).toHaveBeenCalledWith('my question')
  })

  it('copies the assistant message text', () => {
    render(<MessageView message={replyMsg} />)
    fireEvent.click(screen.getByTitle('Copy message'))
    expect(writeText).toHaveBeenCalledWith('the answer')
  })
})

describe('Ctrl+L composer shortcut', () => {
  beforeEach(() => {
    useAppStore.setState({ status: 'connected', isStreaming: false, paletteOpen: false, project: null })
  })

  it('focuses the composer textarea from anywhere in the app', () => {
    render(<App />)
    const ta = document.getElementById('composer-input') as HTMLTextAreaElement
    expect(ta).toBeTruthy()
    ta.blur()
    expect(document.activeElement).not.toBe(ta)
    fireEvent.keyDown(window, { key: 'l', ctrlKey: true })
    expect(document.activeElement).toBe(ta)
  })

  it('does nothing when the composer is disabled (offline)', () => {
    useAppStore.setState({ status: 'offline' })
    render(<App />)
    const ta = document.getElementById('composer-input') as HTMLTextAreaElement
    expect(ta.disabled).toBe(true)
    fireEvent.keyDown(window, { key: 'l', ctrlKey: true })
    expect(document.activeElement).not.toBe(ta)
  })
})
