import React from 'react'
import { useAppStore } from '../store'

export function StatusBar(): React.JSX.Element {
  const status = useAppStore((s) => s.status)
  const model = useAppStore((s) => s.model)
  const contextUsage = useAppStore((s) => s.contextUsage)
  const tokensPerSecond = useAppStore((s) => s.tokensPerSecond)
  const isStreaming = useAppStore((s) => s.isStreaming)
  return (
    <footer className="status-bar">
      <span className={`dot ${status}`} />
      <span>{status}</span>
      {model && <span className="sep">{model.provider}/{model.id}</span>}
      {contextUsage && (
        <span className="sep">
          context {contextUsage.tokens.toLocaleString()} / {Math.round(contextUsage.percent * 100)}%
        </span>
      )}
      {tokensPerSecond != null && <span className="sep">{tokensPerSecond.toFixed(0)} tok/s</span>}
      {isStreaming && <span className="sep streaming">streaming…</span>}
    </footer>
  )
}
