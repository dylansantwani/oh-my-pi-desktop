import React from 'react'
import { useAppStore } from '../store'
import { FolderOpen, RefreshCw, Command, FileDown } from 'lucide-react'

export function TopBar(): React.JSX.Element {
  const project = useAppStore((s) => s.project)
  return (
    <header className="topbar">
      <div className="topbar-title">
        <h1>Oh My Pi Desktop</h1>
      </div>
      <div className="topbar-controls">
        <button
          className="btn project-chip"
          onClick={() => void useAppStore.getState().pickProjectAndConnect()}
          title="Change project"
        >
          <FolderOpen size={14} />
          <span className="ellipsis">{project ?? 'Choose a project…'}</span>
        </button>
        <button className="icon-btn" title="Export session" onClick={() => void useAppStore.getState().exportHtml()}>
          <FileDown size={14} />
        </button>
        <button
          className="icon-btn"
          title="Commands (Ctrl+K)"
          onClick={() => void useAppStore.getState().setPaletteOpen(true)}
        >
          <Command size={14} />
        </button>
        <button className="icon-btn" title="Refresh state" onClick={() => void useAppStore.getState().refreshState()}>
          <RefreshCw size={14} />
        </button>
      </div>
    </header>
  )
}
