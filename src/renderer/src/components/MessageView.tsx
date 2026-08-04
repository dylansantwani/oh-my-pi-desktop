import React from 'react'
import { Markdown } from '../lib/markdown'
import { ToolCallCard } from './ToolCallCard'
import type { TranscriptMessage } from '../lib/transcript'

export function MessageView({ message }: { message: TranscriptMessage }): React.JSX.Element {
  const isUser = message.role === 'user'
  return (
    <div className={`message ${isUser ? 'user' : 'assistant'}`}>
      {!isUser && message.thinking && (
        <details className="thinking">
          <summary>Thinking</summary>
          <pre>{message.thinking}</pre>
        </details>
      )}
      {isUser ? (
        <div className="bubble">{message.text}</div>
      ) : (
        <div className="bubble">
          <Markdown text={message.text} />
          {!message.complete && <span className="caret" aria-hidden="true" />}
          {message.toolCalls.map((t) => (
            <ToolCallCard key={t.id} tool={t} />
          ))}
        </div>
      )}
    </div>
  )
}
