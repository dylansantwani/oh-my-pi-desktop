import React from 'react'
import { useAppStore } from '../store'

export function StatusBar(): React.JSX.Element {
  const status = useAppStore((s) => s.status)
  const contextUsage = useAppStore((s) => s.contextUsage)
  const tokensPerSecond = useAppStore((s) => s.tokensPerSecond)
  const isStreaming = useAppStore((s) => s.isStreaming)
  return (
    <footer className="status-bar">
      <span className={`status-pill ${status}`}>
        <span className="dot" />
        {status}
      </span>
      {contextUsage && (
        <span className="ctx">
          <span>
            context {contextUsage.tokens.toLocaleString()} / {Math.round(contextUsage.percent * 100)}%
          </span>
          <span className="ctx-bar">
            <span className="ctx-fill" style={{ width: `${Math.min(100, Math.round(contextUsage.percent * 100))}%` }} />
          </span>
        </span>
      )}
      {tokensPerSecond != null && <span>{tokensPerSecond.toFixed(0)} tok/s</span>}
      {isStreaming && (
        <span className="stream-indicator" aria-label="streaming">
          <span className="sdot" />
          <span className="sdot" />
          <span className="sdot" />
        </span>
      )}
    </footer>
  )
}
