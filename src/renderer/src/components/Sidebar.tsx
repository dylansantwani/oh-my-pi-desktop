import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import { TodoPanel } from './TodoPanel'
import { Plus, FolderOpen } from 'lucide-react'

// Debounce single clicks so a double-click (rename) never fires switchSession.
let clickTimer: ReturnType<typeof setTimeout> | undefined

export function Sidebar(): React.JSX.Element {
  const project = useAppStore((s) => s.project)
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionPath = useAppStore((s) => s.activeSessionPath)
  const refreshSessions = useAppStore((s) => s.refreshSessions)
  const pickProjectAndConnect = useAppStore((s) => s.pickProjectAndConnect)
  const switchSession = useAppStore((s) => s.switchSession)
  const newSession = useAppStore((s) => s.newSession)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')

  useEffect(() => {
    void refreshSessions()
  }, [project, refreshSessions])

  useEffect(() => {
    return () => {
      if (clickTimer) clearTimeout(clickTimer)
    }
  }, [])

  return (
    <aside className="sidebar">
      <button className="project-picker" onClick={() => void pickProjectAndConnect()} title="Change project">
        <FolderOpen size={14} />
        <span className="ellipsis">{project ?? 'Choose a project…'}</span>
      </button>
      <div className="sidebar-row">
        <span className="sidebar-label">Sessions</span>
        <button className="icon-btn" onClick={() => void newSession()} title="New session">
          <Plus size={14} />
        </button>
      </div>
      <div className="session-list">
        {sessions.length === 0 && <div className="sidebar-note">No sessions yet for this project.</div>}
        {sessions.map((s) => (
          <div
            key={s.path}
            className={`session-item ${s.path === activeSessionPath ? 'active' : ''}`}
            onClick={() => {
              if (clickTimer) clearTimeout(clickTimer)
              clickTimer = setTimeout(() => void switchSession(s.path), 220)
            }}
          >
            {renaming === s.path ? (
              <input
                className="rename-input"
                autoFocus
                value={renameText}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setRenameText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void useAppStore.getState().renameSession(renameText)
                    setRenaming(null)
                  }
                  if (e.key === 'Escape') setRenaming(null)
                }}
                onBlur={() => setRenaming(null)}
              />
            ) : (
              <span
                className="ellipsis session-title"
                onDoubleClick={() => {
                  if (clickTimer) clearTimeout(clickTimer)
                  setRenaming(s.path)
                  setRenameText(s.title)
                }}
                title={s.title}
              >
                {s.title}
              </span>
          )}
        </div>
      ))}
      </div>
      <TodoPanel />
    </aside>
  )
}
