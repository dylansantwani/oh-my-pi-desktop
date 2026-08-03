import React, { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store'
import { MessageView } from './MessageView'

export function Transcript(): React.JSX.Element {
  const messages = useAppStore((s) => s.messages)
  const isStreaming = useAppStore((s) => s.isStreaming)
  const bottomRef = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  // A user bubble with no agent reply (rejected prompt) should offer recovery,
  // but only once it's clearly stale — agent_start usually lands within a beat.
  const [showRecoveryHint, setShowRecoveryHint] = useState(false)

  useEffect(() => {
    if (pinned.current) bottomRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [messages])

  useEffect(() => {
    if (isStreaming || messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      setShowRecoveryHint(false)
      return
    }
    const t = setTimeout(() => setShowRecoveryHint(true), 1200)
    return () => clearTimeout(t)
  }, [messages, isStreaming])

  const onScroll = (e: React.UIEvent<HTMLDivElement>): void => {
    const el = e.currentTarget
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  return (
    <div className="transcript" onScroll={onScroll}>
      {messages.length === 0 && !isStreaming && (
        <div className="empty-hint">Pick a session on the left, or send a message to start a new one.</div>
      )}
      {showRecoveryHint && (
        <div className="empty-hint">
          The agent didn't reply to your last message — it may have rejected the prompt. Try again, or switch sessions on the left.
        </div>
      )}
      {messages.map((m) => (
        <MessageView key={m.id} message={m} />
      ))}
      {isStreaming && <div className="streaming-dot" />}
      <div ref={bottomRef} />
    </div>
  )
}
