import React, { useState } from 'react'
import { useAppStore } from '../store'
import { Send, Square } from 'lucide-react'

export function Composer(): React.JSX.Element {
  const [text, setText] = useState('')
  const isStreaming = useAppStore((s) => s.isStreaming)
  const sendPrompt = useAppStore((s) => s.sendPrompt)
  const abort = useAppStore((s) => s.abort)
  const steer = useAppStore((s) => s.steer)
  const followUp = useAppStore((s) => s.followUp)

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
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
    <form className="composer" onSubmit={submit}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            ;(e.currentTarget.form as HTMLFormElement).requestSubmit()
          }
        }}
        placeholder="Message the agent…  (Enter to send, Shift+Enter for newline)"
        rows={1}
        autoFocus
      />
      {isStreaming ? (
        <div className="composer-actions">
          <button type="button" className="btn" onClick={() => submitStreaming('followUp')} title="Queue follow-up (sends after this turn)">
            Queue
          </button>
          <button type="button" className="btn danger" onClick={() => submitStreaming('steer')} title="Interrupt and send now">
            Interrupt
          </button>
          <button type="button" className="btn danger" onClick={() => void abort()} title="Abort turn">
            <Square size={16} />
          </button>
        </div>
      ) : (
        <button type="submit" className="btn primary" disabled={!text.trim()} title="Send">
          <Send size={16} />
        </button>
      )}
    </form>
  )
}
