import React from 'react'
import { useAppStore } from '../store'

const STATUS_CLASS: Record<string, string> = {
  pending: 'todo-pending',
  in_progress: 'todo-progress',
  completed: 'todo-done',
  blocked: 'todo-blocked',
  dropped: 'todo-dropped'
}

export function TodoPanel(): React.JSX.Element | null {
  const todos = useAppStore((s) => s.todos)
  if (todos.length === 0) return null
  return (
    <div className="todo-panel">
      <div className="sidebar-label">Todos</div>
      {todos.map((phase) => (
        <div key={phase.id} className="todo-phase">
          <div className="todo-phase-name">{phase.name}</div>
          {phase.tasks.map((t) => (
            <div key={t.id} className={`todo-task ${STATUS_CLASS[t.status] ?? 'todo-pending'}`}>
              <span className="todo-bullet" />
              <span className="ellipsis">{t.content}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
