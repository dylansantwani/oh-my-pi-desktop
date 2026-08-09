import React, { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../store'
import { Plus, FolderOpen, Search } from 'lucide-react'
import { groupSessionsByDay } from '../lib/sessions'

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

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q ? sessions.filter((s) => s.title.toLowerCase().includes(q)) : sessions
    return groupSessionsByDay(filtered)
  }, [sessions, query])

  // renameSession() carries no session id — omp renames whatever session is
  // currently open. Opening the editor on a row that is not active would
  // therefore retitle a different session than the one being edited, so make
  // the row active first and only then edit. switchSession is a no-op when the
  // row is already active.
  const beginRename = (path: string, title: string): void => {
    void (async () => {
      await switchSession(path)
      setRenaming(path)
      setRenameText(title)
    })()
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="brand-mark" aria-hidden="true">
          π
        </div>
        <span className="sidebar-app-name">Oh My Pi</span>
        <button className="icon-btn" onClick={() => void newSession()} title="New session (Ctrl+N)" aria-label="New session">
          <Plus size={14} />
        </button>
      </div>
      <div className="sidebar-search">
        <Search size={12} aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sessions…"
          aria-label="Search sessions"
        />
      </div>
      <div className="session-list" role="listbox" aria-label="Sessions">
        {groups.length === 0 && (
          <div className="sidebar-note">{query ? 'No sessions match.' : 'No sessions yet for this project.'}</div>
        )}
        {groups.map((g) => (
          <div key={g.label} className="session-group" role="group" aria-label={g.label}>
            <div className="sidebar-label">{g.label}</div>
            {g.items.map((s) => {
              const active = s.path === activeSessionPath
              return (
                <div
                  key={s.path}
                  className={`session-item ${active ? 'active' : ''}`}
                  role="option"
                  aria-selected={active}
                  // Renaming swaps in a text field; leaving the row tabbable
                  // then puts a second stop in front of its own editor.
                  tabIndex={renaming === s.path ? -1 : 0}
                  onClick={() => void switchSession(s.path)}
                  onDoubleClick={() => beginRename(s.path, s.title)}
                  onKeyDown={(e) => {
                    if (renaming === s.path) return
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      void switchSession(s.path)
                    }
                    // F2 is the platform convention for rename, and the only
                    // way to reach it without a mouse — double-click cannot be
                    // expressed on a keyboard.
                    if (e.key === 'F2') {
                      e.preventDefault()
                      beginRename(s.path, s.title)
                    }
                  }}
                  title={s.title}
                >
                  {renaming === s.path ? (
                    <input
                      className="rename-input"
                      autoFocus
                      aria-label={`Rename session ${s.title}`}
                      value={renameText}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onChange={(e) => setRenameText(e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation()
                        if (e.key === 'Enter') {
                          const name = renameText.trim()
                          if (name) void useAppStore.getState().renameSession(name)
                          setRenaming(null)
                        }
                        if (e.key === 'Escape') setRenaming(null)
                      }}
                      // Clicking away commits rather than silently discarding
                      // what was typed — losing the edit was the surprising half
                      // of the old behaviour.
                      onBlur={() => {
                        const name = renameText.trim()
                        if (name && name !== s.title) void useAppStore.getState().renameSession(name)
                        setRenaming(null)
                      }}
                    />
                  ) : (
                    <>
                      <span className="ellipsis session-title">{s.title}</span>
                      {active && isStreaming && (
                        <span className="session-spinner" role="img" aria-label="Agent is working" />
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <div className="sidebar-foot">
        <button className="project-chip" onClick={() => void pickProjectAndConnect()} title="Change project">
          <FolderOpen size={13} aria-hidden="true" />
          <span className="ellipsis">{project ?? 'Choose a project…'}</span>
        </button>
      </div>
    </aside>
  )
}
