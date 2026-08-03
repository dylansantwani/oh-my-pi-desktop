// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useAppStore } from '../../src/renderer/src/store'
import { Composer } from '../../src/renderer/src/components/Composer'

describe('Composer', () => {
  const sendPrompt = vi.fn(async () => {})
  const steer = vi.fn(async () => {})
  const followUp = vi.fn(async () => {})
  const abort = vi.fn(async () => {})

  beforeEach(() => {
    sendPrompt.mockClear()
    steer.mockClear()
    followUp.mockClear()
    abort.mockClear()
    useAppStore.setState({
      status: 'offline',
      isStreaming: false,
      sendPrompt,
      steer,
      followUp,
      abort
    })
  })

  it('disables input and send while offline, with a connect hint', () => {
    render(<Composer />)
    const ta = screen.getByPlaceholderText('Connect to a project to start chatting…') as HTMLTextAreaElement
    expect(ta.disabled).toBe(true)
    const send = screen.getByTitle('Send') as HTMLButtonElement
    expect(send.disabled).toBe(true)
  })

  it('enables input once connected and sends the prompt on submit', () => {
    useAppStore.setState({ status: 'connected' })
    render(<Composer />)
    const ta = screen.getByPlaceholderText(/Message the agent/) as HTMLTextAreaElement
    expect(ta.disabled).toBe(false)
    fireEvent.change(ta, { target: { value: 'hello' } })
    fireEvent.submit(ta.closest('form') as HTMLFormElement)
    expect(sendPrompt).toHaveBeenCalledWith('hello')
  })

  it('does not send while offline even if text is entered', () => {
    render(<Composer />)
    const ta = screen.getByPlaceholderText('Connect to a project to start chatting…') as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: 'hello' } })
    fireEvent.submit(ta.closest('form') as HTMLFormElement)
    expect(sendPrompt).not.toHaveBeenCalled()
  })

  it('routes Enter while streaming to followUp (queue), never prompt', () => {
    useAppStore.setState({ status: 'connected', isStreaming: true })
    render(<Composer />)
    const ta = screen.getByPlaceholderText(/Message the agent/) as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: 'more' } })
    fireEvent.keyDown(ta, { key: 'Enter' })
    expect(followUp).toHaveBeenCalledWith('more')
    expect(sendPrompt).not.toHaveBeenCalled()
  })

  it('routes Interrupt to steer with the draft text', () => {
    useAppStore.setState({ status: 'connected', isStreaming: true })
    render(<Composer />)
    const ta = screen.getByPlaceholderText(/Message the agent/) as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: 'urgent' } })
    fireEvent.click(screen.getByTitle('Interrupt and send now'))
    expect(steer).toHaveBeenCalledWith('urgent')
  })

  it('routes the abort button to abort', () => {
    useAppStore.setState({ status: 'connected', isStreaming: true })
    render(<Composer />)
    fireEvent.click(screen.getByTitle('Abort turn'))
    expect(abort).toHaveBeenCalled()
  })
})
