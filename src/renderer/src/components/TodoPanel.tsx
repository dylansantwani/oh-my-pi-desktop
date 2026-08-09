import React, { useState } from 'react'
import { useAppStore } from '../store'
import { Check, Circle, Clock, Ban, X, ChevronDown, ChevronRight } from 'lucide-react'

const STATUS_ICON: Record<string, React.JSX.Element> = {
  pending: <Circle size={12} />,
  in_progress: <Clock size={12} className="todo-spin" />,
  completed: <Check size={12} />,
  blocked: <Ban size={12} />,
  dropped: <X size={12} />
}
const STATUS_CLASS: Record<string, string> = {
  pending: 'todo-pending',
  in_progress: 'todo-progress',
  completed: 'todo-done',
  blocked: 'todo-blocked',
  dropped: 'todo-dropped'
}
// The icon and its colour are the only visual signal for status, so the label is
// what carries it to screen readers and to anyone who cannot tell the hues apart.
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Completed',
  blocked: 'Blocked',
  dropped: 'Dropped'
}

export function TodoPanel(): React.JSX.Element | null {
  const todos = useAppStore((s) => s.todos)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  if (todos.length === 0) return <div className="panel-empty">No tasks yet — ask the agent to plan something.</div>
  return (
    <div className="todo-panel">
      {todos.map((phase) => {
        const done = phase.tasks.filter((t) => t.status === 'completed').length
        const isCollapsed = collapsed.has(phase.id)
        return (
          <div key={phase.id} className="todo-phase">
            <button
              className="todo-phase-name"
              aria-expanded={!isCollapsed}
              onClick={() =>
                setCollapsed((prev) => {
                  const next = new Set(prev)
                  if (next.has(phase.id)) next.delete(phase.id)
                  else next.add(phase.id)
                  return next
                })
              }
            >
              {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              <span className="ellipsis">{phase.name}</span>
              <span className="todo-progress-pill">
                {done}/{phase.tasks.length}
              </span>
            </button>
            {!isCollapsed &&
              phase.tasks.map((t) => (
                <div
                  key={t.id}
                  className={`todo-task ${STATUS_CLASS[t.status] ?? 'todo-pending'}`}
                >
                  <span
                    className="todo-status-icon"
                    role="img"
                    aria-label={STATUS_LABEL[t.status] ?? 'Pending'}
                    title={STATUS_LABEL[t.status] ?? 'Pending'}
                  >
                    {STATUS_ICON[t.status] ?? <Circle size={12} />}
                  </span>
                  {/* No `ellipsis` here — a truncated task is unreadable, so it wraps. */}
                  <span>{t.content}</span>
                </div>
              ))}
          </div>
        )
      })}
    </div>
  )
}
