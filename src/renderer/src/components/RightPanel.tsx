import React from 'react'
import { useAppStore } from '../store'
import { TodoPanel } from './TodoPanel'
import { FilesPanel } from './FilesPanel'
import { ContextPanel } from './ContextPanel'
import { CheckSquare, Files, SlidersHorizontal } from 'lucide-react'

const TABS = [
  { id: 'todos', label: 'Todos', icon: <CheckSquare size={13} /> },
  { id: 'files', label: 'Files', icon: <Files size={13} /> },
  { id: 'context', label: 'Context', icon: <SlidersHorizontal size={13} /> }
] as const

export function RightPanel(): React.JSX.Element {
  const tab = useAppStore((s) => s.rightTab)
  const setRightTab = useAppStore((s) => s.setRightTab)

  // The strip is a single tab stop, so Tab moves past it into the panel body and
  // the arrows are what walk between the tabs themselves.
  const onTabKey = (e: React.KeyboardEvent<HTMLButtonElement>): void => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (dir === 0) return
    e.preventDefault()
    const next = TABS[(TABS.findIndex((t) => t.id === tab) + dir + TABS.length) % TABS.length]
    setRightTab(next.id)
    document.getElementById(`right-tab-${next.id}`)?.focus()
  }

  return (
    <aside className="right-panel">
      <div className="right-tabs" role="tablist" aria-label="Session panels">
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`right-tab-${t.id}`}
            className={`right-tab ${tab === t.id ? 'active' : ''}`}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`right-tabpanel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setRightTab(t.id)}
            onKeyDown={onTabKey}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      <div className="right-panel-body" role="tabpanel" id={`right-tabpanel-${tab}`} aria-labelledby={`right-tab-${tab}`}>
        {tab === 'todos' && <TodoPanel />}
        {tab === 'files' && <FilesPanel />}
        {tab === 'context' && <ContextPanel />}
      </div>
    </aside>
  )
}
