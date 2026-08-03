import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import { RefreshCw, Zap, ZapOff } from 'lucide-react'

const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

export function TopBar(): React.JSX.Element {
  const model = useAppStore((s) => s.model)
  const status = useAppStore((s) => s.status)
  const thinkingLevel = useAppStore((s) => s.thinkingLevel)
  const fastMode = useAppStore((s) => s.fastMode)
  const setModel = useAppStore((s) => s.setModel)
  const setThinkingLevel = useAppStore((s) => s.setThinkingLevel)
  const setFastMode = useAppStore((s) => s.setFastMode)
  const [models, setModels] = useState<{ provider: string; id: string }[]>([])

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

  return (
    <header className="topbar">
      <div className="topbar-title">
        <h1>Oh My Pi Desktop</h1>
      </div>
      <div className="topbar-controls">
        <select
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
        <select
          value={thinkingLevel}
          onChange={(e) => void setThinkingLevel(e.target.value)}
          title="Thinking level"
        >
          {THINKING_LEVELS.map((l) => (
            <option key={l} value={l}>
              think: {l}
            </option>
          ))}
        </select>
        <button
          className={`icon-btn ${fastMode ? 'on' : ''}`}
          title={fastMode ? 'Fast mode on' : 'Fast mode off'}
          onClick={() => void setFastMode(!fastMode)}
        >
          {fastMode ? <Zap size={14} /> : <ZapOff size={14} />}
        </button>
        <button className="icon-btn" title="Refresh state" onClick={() => void useAppStore.getState().refreshState()}>
          <RefreshCw size={14} />
        </button>
      </div>
    </header>
  )
}
