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
  return (
    <aside className="right-panel">
      <div className="right-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`right-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setRightTab(t.id)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      <div className="right-panel-body">
        {tab === 'todos' && <TodoPanel />}
        {tab === 'files' && <FilesPanel />}
        {tab === 'context' && <ContextPanel />}
      </div>
    </aside>
  )
}
