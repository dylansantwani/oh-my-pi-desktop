import React from 'react'
import { useAppStore } from '../store'
import { AlertTriangle, X } from 'lucide-react'
import { contextPercent } from '../lib/context-usage'

/** 48213 → "48.2K". The bar used to read "context 48,213 / 24%", which scans as
 *  a count over a percentage; the window size was fetched but never shown. */
function compact(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) {
    const k = n / 1000
    return `${k < 100 ? k.toFixed(1) : Math.round(k)}K`
  }
  return `${(n / 1_000_000).toFixed(1)}M`
}

export function StatusBar(): React.JSX.Element {
  const status = useAppStore((s) => s.status)
  const contextUsage = useAppStore((s) => s.contextUsage)
  const tokensPerSecond = useAppStore((s) => s.tokensPerSecond)
  const isStreaming = useAppStore((s) => s.isStreaming)
  const agentError = useAppStore((s) => s.agentError)
  const pct = contextUsage ? Math.round(contextPercent(contextUsage)) : 0
  return (
    <footer className="status-bar">
      <span className={`status-pill ${status}`} role="status" aria-live="polite">
        <span className="dot" aria-hidden="true" />
        {status}
      </span>
      {contextUsage && (
        <span className="ctx" title={`${contextUsage.tokens.toLocaleString()} of ${contextUsage.contextWindow.toLocaleString()} tokens`}>
          <span>
            context {compact(contextUsage.tokens)} / {compact(contextUsage.contextWindow)} · {pct}%
          </span>
          <span className="ctx-bar">
            <span className={`ctx-fill ${pct > 90 ? 'danger' : pct > 70 ? 'warn' : ''}`} style={{ width: `${pct}%` }} />
          </span>
        </span>
      )}
      {tokensPerSecond != null && <span>{tokensPerSecond.toFixed(0)} tok/s</span>}
      {isStreaming && (
        <span className="stream-indicator" role="img" aria-label="Agent is responding">
          <span className="sdot" />
          <span className="sdot" />
          <span className="sdot" />
        </span>
      )}
      {/* The agent's own failures used to reach only the main-process console,
          so a broken omp left a UI that looked fine and did nothing. This stays
          until it is dismissed or a connection succeeds. */}
      {agentError && (
        <span className="agent-error" role="alert">
          <AlertTriangle size={12} aria-hidden="true" />
          <span className="ellipsis" title={agentError}>
            {agentError}
          </span>
          <button className="agent-error-action" onClick={() => useAppStore.getState().setSettingsOpen(true)}>
            Settings
          </button>
          <button
            className="agent-error-dismiss"
            onClick={() => useAppStore.getState().dismissAgentError()}
            aria-label="Dismiss agent error"
            title="Dismiss"
          >
            <X size={12} />
          </button>
        </span>
      )}
    </footer>
  )
}
