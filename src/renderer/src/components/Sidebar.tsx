import React, { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../store'
import { Plus, FolderOpen, Search } from 'lucide-react'
import { groupSessionsByDay } from '../lib/sessions'

// Debounce single clicks so a double-click (rename) never fires switchSession.
let clickTimer: ReturnType<typeof setTimeout> | undefined

export function Sidebar(): React.JSX.Element {
  const project = useAppStore((s) => s.project)
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionPath = useAppStore((s) => s.activeSessionPath)
  const isStreaming = useAppStore((s) => s.isStreaming)
  const refreshSessions = useAppStore((s) => s.refreshSessions)
  const pickProjectAndConnect = useAppStore((s) => s.pickProjectAndConnect)
  const switchSession = useAppStore((s) => s.switchSession)
  const newSession = useAppStore((s) => s.newSession)
  const [query, setQuery] = useState('')
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

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q ? sessions.filter((s) => s.title.toLowerCase().includes(q)) : sessions
    return groupSessionsByDay(filtered)
  }, [sessions, query])

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="brand-mark" aria-hidden="true">
          π
        </div>
        <span className="sidebar-app-name">Oh My Pi</span>
        <button className="icon-btn" onClick={() => void newSession()} title="New session (Ctrl+N)">
          <Plus size={14} />
        </button>
      </div>
      <div className="sidebar-search">
        <Search size={12} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search sessions…" />
      </div>
      <div className="session-list">
        {groups.length === 0 && (
          <div className="sidebar-note">{query ? 'No sessions match.' : 'No sessions yet for this project.'}</div>
        )}
        {groups.map((g) => (
          <div key={g.label} className="session-group">
            <div className="sidebar-label">{g.label}</div>
            {g.items.map((s) => (
              <div
                key={s.path}
                className={`session-item ${s.path === activeSessionPath ? 'active' : ''}`}
                onClick={() => {
                  if (clickTimer) clearTimeout(clickTimer)
                  clickTimer = setTimeout(() => void switchSession(s.path), 220)
                }}
                onDoubleClick={() => {
                  if (clickTimer) clearTimeout(clickTimer)
                  setRenaming(s.path)
                  setRenameText(s.title)
                }}
                title={s.title}
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
                  <>
                    <span className="ellipsis session-title">{s.title}</span>
                    {s.path === activeSessionPath && isStreaming && (
                      <span className="session-spinner" aria-label="streaming" />
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="sidebar-foot">
        <button className="project-chip" onClick={() => void pickProjectAndConnect()} title="Change project">
          <FolderOpen size={13} />
          <span className="ellipsis">{project ?? 'Choose a project…'}</span>
        </button>
      </div>
    </aside>
  )
}
