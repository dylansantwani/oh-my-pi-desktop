import React, { useEffect, useRef } from 'react'
import { useAppStore } from '../store'
import { MessageView } from './MessageView'

export function Transcript(): React.JSX.Element {
  const messages = useAppStore((s) => s.messages)
  const isStreaming = useAppStore((s) => s.isStreaming)
  const bottomRef = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  useEffect(() => {
    if (pinned.current) bottomRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [messages])

  const onScroll = (e: React.UIEvent<HTMLDivElement>): void => {
    const el = e.currentTarget
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  return (
    <div className="transcript" onScroll={onScroll}>
      {messages.length === 0 && !isStreaming && (
        <div className="empty-hint">Pick a session on the left, or send a message to start a new one.</div>
      )}
      {messages.map((m) => (
        <MessageView key={m.id} message={m} />
      ))}
      {isStreaming && <div className="streaming-dot" />}
      <div ref={bottomRef} />
    </div>
  )
}
