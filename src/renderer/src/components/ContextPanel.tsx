import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import { Zap, ZapOff } from 'lucide-react'

const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

export function ContextPanel(): React.JSX.Element {
  const model = useAppStore((s) => s.model)
  const status = useAppStore((s) => s.status)
  const thinkingLevel = useAppStore((s) => s.thinkingLevel)
  const fastMode = useAppStore((s) => s.fastMode)
  const sessionName = useAppStore((s) => s.sessionName)
  const contextUsage = useAppStore((s) => s.contextUsage)
  const setModel = useAppStore((s) => s.setModel)
  const setThinkingLevel = useAppStore((s) => s.setThinkingLevel)
  const setFastMode = useAppStore((s) => s.setFastMode)
  const renameSession = useAppStore((s) => s.renameSession)
  const [models, setModels] = useState<{ provider: string; id: string }[]>([])
  const [nameDraft, setNameDraft] = useState<string | null>(null)

  useEffect(() => {
    if (status !== 'connected') return
    void (async () => {
      try {
        const data = (await window.omp.getModels()) as { models?: { provider: string; id: string }[]; data?: unknown }
        const list = Array.isArray(data.models) ? data.models : Array.isArray(data) ? data : []
        setModels(list)
      } catch {
        /* not connected */
      }
    })()
  }, [model, status])

  const pct = contextUsage ? Math.min(100, Math.round(contextUsage.percent * 100)) : 0

  return (
    <div className="context-panel">
      <div className="ctx-section">
        <label className="sidebar-label">Model</label>
        <select
          className="ctx-select"
          value={model ? `${model.provider}/${model.id}` : ''}
          onChange={(e) => {
            const [provider, ...rest] = e.target.value.split('/')
            void setModel(provider, rest.join('/'))
          }}
        >
          <option value="" disabled>
            {model ? `${model.provider}/${model.id}` : 'Model…'}
          </option>
          {models.map((m) => (
            <option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
              {m.provider}/{m.id}
            </option>
          ))}
        </select>
      </div>
      <div className="ctx-section">
        <label className="sidebar-label">Thinking level</label>
        <select className="ctx-select" value={thinkingLevel} onChange={(e) => void setThinkingLevel(e.target.value)}>
          {THINKING_LEVELS.map((l) => (
            <option key={l} value={l}>
              think: {l}
            </option>
          ))}
        </select>
      </div>
      <div className="ctx-section">
        <label className="sidebar-label">Fast mode</label>
        <button className={`btn ${fastMode ? 'on' : ''}`} onClick={() => void setFastMode(!fastMode)}>
          {fastMode ? <Zap size={14} /> : <ZapOff size={14} />} {fastMode ? 'On' : 'Off'}
        </button>
      </div>
      <div className="ctx-section">
        <label className="sidebar-label">Session name</label>
        <input
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
          <label className="sidebar-label">Context</label>
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
