import React, { useLayoutEffect, useRef, useState } from 'react'
import { useAppStore } from '../store'
import { Send, Square } from 'lucide-react'
import { ModelSelector } from './ModelSelector'

export function Composer(): React.JSX.Element {
  const [text, setText] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)
  const status = useAppStore((s) => s.status)
  const isStreaming = useAppStore((s) => s.isStreaming)
  const sendPrompt = useAppStore((s) => s.sendPrompt)
  const abort = useAppStore((s) => s.abort)
  const steer = useAppStore((s) => s.steer)
  const followUp = useAppStore((s) => s.followUp)
  const connected = status === 'connected'

  // `rows={1}` is only the floor: a textarea never grows on its own, so a
  // multi-line prompt used to sit clipped inside a one-line box. Measure after
  // every change and set the height explicitly — collapsing to `auto` first so
  // scrollHeight reflects the new content instead of the previous, taller box.
  // The CSS max-height caps the growth and hands scrolling back to the textarea.
  useLayoutEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }, [text])

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (!connected) return
    if (!text.trim()) return
    if (isStreaming) {
      // A plain `prompt` while the agent is mid-turn is rejected; queue it so
      // Enter keeps meaning "send" without interrupting the running turn.
      submitStreaming('followUp')
      return
    }
    void sendPrompt(text)
    setText('')
  }

  const submitStreaming = (mode: 'steer' | 'followUp'): void => {
    if (!text.trim()) return
    void (mode === 'steer' ? steer(text) : followUp(text))
    setText('')
  }

  return (
    // The textarea and its controls share one bordered box so the composer
    // reads as a single field, with the model in the corner rather than tucked
    // away in a side panel.
    <form className="composer" onSubmit={submit}>
      <div className="composer-box">
        <textarea
          id="composer-input"
          ref={taRef}
          aria-label="Message the agent"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              ;(e.currentTarget.form as HTMLFormElement).requestSubmit()
            }
          }}
          placeholder={connected ? 'Message the agent…  (Enter to send, Shift+Enter for newline)' : 'Connect to a project to start chatting…'}
          rows={1}
          autoFocus
          disabled={!connected}
        />
        <div className="composer-toolbar">
          <ModelSelector />
          {isStreaming ? (
            <div className="composer-actions">
              <button type="button" className="btn" onClick={() => submitStreaming('followUp')} title="Queue follow-up (sends after this turn)">
                Queue
              </button>
              <button type="button" className="btn danger" onClick={() => submitStreaming('steer')} title="Interrupt and send now">
                Interrupt
              </button>
              <button type="button" className="btn danger" onClick={() => void abort()} title="Abort turn" aria-label="Abort turn">
                <Square size={16} />
              </button>
            </div>
          ) : (
            <button type="submit" className="btn primary composer-send" disabled={!connected || !text.trim()} title="Send" aria-label="Send message">
              <Send size={15} />
            </button>
          )}
        </div>
      </div>
    </form>
  )
}
