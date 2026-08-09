import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../store'
import { Check, ChevronDown } from 'lucide-react'

/** omp reports a friendly `name` alongside the id; falling back to the id keeps
 *  the control honest for a model the catalogue doesn't describe. */
function label(m: { id: string; name?: string } | null): string {
  if (!m) return 'Model'
  return m.name && m.name.trim() ? m.name : m.id
}

function compactWindow(n?: number): string | null {
  if (!n || n <= 0) return null
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M`
  return `${Math.round(n / 1000)}K`
}

export function ModelSelector(): React.JSX.Element {
  const model = useAppStore((s) => s.model)
  const models = useAppStore((s) => s.models)
  const status = useAppStore((s) => s.status)
  const setModel = useAppStore((s) => s.setModel)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const connected = status === 'connected'

  // Provider is the only grouping omp gives us, and with a handful of models
  // from three vendors an ungrouped list reads as noise.
  const groups = useMemo(() => {
    const byProvider = new Map<string, typeof models>()
    for (const m of models) {
      const list = byProvider.get(m.provider) ?? []
      list.push(m)
      byProvider.set(m.provider, list)
    }
    return [...byProvider.entries()].map(([provider, items]) => ({ provider, items }))
  }, [models])

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups])

  useEffect(() => {
    if (!open) return
    const current = flat.findIndex((m) => m.provider === model?.provider && m.id === model?.id)
    setActive(current >= 0 ? current : 0)
    // The catalogue is fetched on connect; refresh on open too so a model added
    // while the window was already up still shows.
    void useAppStore.getState().refreshModels()
  }, [open, model, flat.length])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (open) listRef.current?.querySelector('.model-option.active')?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const close = (restoreFocus: boolean): void => {
    setOpen(false)
    if (restoreFocus) buttonRef.current?.focus()
  }

  const choose = (m: { provider: string; id: string }): void => {
    void setModel(m.provider, m.id)
    close(true)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close(true)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, flat.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(flat.length - 1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const m = flat[active]
      if (m) choose(m)
    }
  }

  return (
    <div className="model-selector" ref={rootRef}>
      <button
        type="button"
        ref={buttonRef}
        className="model-button"
        disabled={!connected}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={model ? `${model.provider}/${model.id}` : 'Choose a model'}
      >
        <span className="ellipsis">{connected ? label(model) : 'Model'}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <div className="model-menu" role="listbox" aria-label="Model" ref={listRef} onKeyDown={onKeyDown}>
          {flat.length === 0 && <div className="model-empty">No models reported by the agent.</div>}
          {groups.map((g) => (
            <div key={g.provider} className="model-group">
              <div className="model-group-name">{g.provider}</div>
              {g.items.map((m) => {
                const index = flat.indexOf(m)
                const selected = m.provider === model?.provider && m.id === model?.id
                const win = compactWindow(m.contextWindow)
                return (
                  <button
                    type="button"
                    key={`${m.provider}/${m.id}`}
                    role="option"
                    aria-selected={selected}
                    className={`model-option${index === active ? ' active' : ''}`}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(m)}
                  >
                    <span className="model-check">{selected && <Check size={12} aria-hidden="true" />}</span>
                    <span className="ellipsis">{label(m)}</span>
                    {win && <span className="model-window">{win}</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
