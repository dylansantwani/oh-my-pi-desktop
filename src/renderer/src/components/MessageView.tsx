import React, { useState } from 'react'
import { Markdown } from '../lib/markdown'
import { ToolCallCard } from './ToolCallCard'
import type { TranscriptMessage } from '../lib/transcript'
import { Copy, Check } from 'lucide-react'

function CopyMessageButton({ text }: { text: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className={`msg-copy ${copied ? 'copied' : ''}`}
      title={copied ? 'Copied' : 'Copy message'}
      aria-label={copied ? 'Message copied' : 'Copy message'}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  )
}

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
        <div className="bubble">
          {message.text}
          <CopyMessageButton text={message.text} />
        </div>
      ) : (
        <div className="bubble" aria-live="polite" aria-busy={!message.complete}>
          {/* Announcing every streamed token would be unusable, so aria-busy holds
              the region back until message_end flips `complete` and it reads once. */}
          <Markdown text={message.text} />
          {message.text && <CopyMessageButton text={message.text} />}
          {!message.complete && <span className="caret" aria-hidden="true" />}
          {message.toolCalls.map((t) => (
            <ToolCallCard key={t.id} tool={t} />
          ))}
        </div>
      )}
    </div>
  )
}
