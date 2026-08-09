import React, { useState } from 'react'
import { useAppStore } from '../store'
import { Zap, ZapOff } from 'lucide-react'
import { contextPercent } from '../lib/context-usage'

const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

export function ContextPanel(): React.JSX.Element {
  const model = useAppStore((s) => s.model)
  const thinkingLevel = useAppStore((s) => s.thinkingLevel)
  const fastMode = useAppStore((s) => s.fastMode)
  const sessionName = useAppStore((s) => s.sessionName)
  const contextUsage = useAppStore((s) => s.contextUsage)
  const setThinkingLevel = useAppStore((s) => s.setThinkingLevel)
  const setFastMode = useAppStore((s) => s.setFastMode)
  const renameSession = useAppStore((s) => s.renameSession)
  const [nameDraft, setNameDraft] = useState<string | null>(null)

  const pct = contextUsage ? Math.round(contextPercent(contextUsage)) : 0

  return (
    <div className="context-panel">
      <div className="ctx-section">
        <span className="sidebar-label">Model</span>
        <span className="ctx-readout" title={model ? `${model.provider}/${model.id}` : undefined}>
          {model ? (model.name ?? model.id) : '—'}
          {model && <span className="ctx-readout-sub">{model.provider}</span>}
        </span>
      </div>
      <div className="ctx-section">
        <label className="sidebar-label" htmlFor="ctx-thinking">
          Thinking level
        </label>
        <select
          id="ctx-thinking"
          className="ctx-select"
          value={thinkingLevel}
          onChange={(e) => void setThinkingLevel(e.target.value)}
        >
          {THINKING_LEVELS.map((l) => (
            <option key={l} value={l}>
              think: {l}
            </option>
          ))}
        </select>
      </div>
      <div className="ctx-section">
        {/* A toggle button rather than a form control, so it names itself from the
            label plus its own text ("Fast mode On") and reports state via aria-pressed. */}
        <span className="sidebar-label" id="ctx-fast-label">
          Fast mode
        </span>
        <button
          id="ctx-fast"
          className={`btn ${fastMode ? 'on' : ''}`}
          aria-pressed={fastMode}
          aria-labelledby="ctx-fast-label ctx-fast"
          onClick={() => void setFastMode(!fastMode)}
        >
          {fastMode ? <Zap size={14} /> : <ZapOff size={14} />} {fastMode ? 'On' : 'Off'}
        </button>
      </div>
      <div className="ctx-section">
        <label className="sidebar-label" htmlFor="ctx-session-name">
          Session name
        </label>
        <input
          id="ctx-session-name"
          className="ctx-input"
          value={nameDraft ?? sessionName}
          placeholder="Untitled session"
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => {
            if (nameDraft !== null && nameDraft.trim()) void renameSession(nameDraft.trim())
            setNameDraft(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
          }}
        />
      </div>
      {contextUsage && (
        <div className="ctx-section">
          {/* Read-only readout, so a <label> here would point at no control. */}
          <span className="sidebar-label">Context</span>
          <div className="ctx-usage">
            <span>
              {contextUsage.tokens.toLocaleString()} tokens · {pct}%
            </span>
            <div className="ctx-bar">
              <div className={`ctx-fill ${pct > 90 ? 'danger' : pct > 70 ? 'warn' : ''}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
