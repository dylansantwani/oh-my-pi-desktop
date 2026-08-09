import React from 'react'
import { useAppStore } from '../store'
import { FolderOpen, RefreshCw, Command, FileDown, Search, PanelRight, Settings } from 'lucide-react'

/** Ctrl on Windows/Linux, ⌘ on macOS — the tooltips are the only place these
 *  shortcuts are discoverable outside the menu bar, which Windows hides. */
function mod(isMac: boolean): string {
  return isMac ? '⌘' : 'Ctrl+'
}

export function TopBar(): React.JSX.Element {
  const project = useAppStore((s) => s.project)
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen)
  // The window has no title bar on macOS — the traffic lights are overlaid on
  // this strip, so it needs a left inset to clear them.
  const isMac = window.omp?.platform === 'darwin'
  const k = mod(isMac)
  return (
    <header className={isMac ? 'topbar is-mac' : 'topbar'}>
      <div className="topbar-controls no-drag">
        <button
          className="btn project-chip"
          onClick={() => void useAppStore.getState().pickProjectAndConnect()}
          title="Change project"
        >
          <FolderOpen size={14} aria-hidden="true" />
          <span className="ellipsis">{project ?? 'Choose a project…'}</span>
        </button>
        {/* Find, the panel toggle and Settings previously existed only as menu
            items — invisible on Windows, where the menu bar is folded away
            until Alt — so each one gets a real control here too. */}
        <button
          className="icon-btn"
          title={`Find in transcript (${k}F)`}
          aria-label="Find in transcript"
          onClick={() => useAppStore.getState().setSearchOpen(true)}
        >
          <Search size={14} />
        </button>
        <button
          className="icon-btn"
          title="Export session"
          aria-label="Export session to HTML"
          onClick={() => void useAppStore.getState().exportHtml()}
        >
          <FileDown size={14} />
        </button>
        <button
          className="icon-btn"
          title={`Commands (${k}K)`}
          aria-label="Open command palette"
          onClick={() => void useAppStore.getState().setPaletteOpen(true)}
        >
          <Command size={14} />
        </button>
        <button
          className="icon-btn"
          title="Refresh state"
          aria-label="Refresh agent state"
          onClick={() => void useAppStore.getState().refreshState()}
        >
          <RefreshCw size={14} />
        </button>
        <button
          className={rightPanelOpen ? 'icon-btn on' : 'icon-btn'}
          title={`Toggle side panel (${k}B)`}
          aria-label="Toggle side panel"
          aria-pressed={rightPanelOpen}
          onClick={() => useAppStore.getState().toggleRightPanel()}
        >
          <PanelRight size={14} />
        </button>
        <button
          className="icon-btn"
          title={`Settings (${k},)`}
          aria-label="Settings"
          onClick={() => useAppStore.getState().setSettingsOpen(true)}
        >
          <Settings size={14} />
        </button>
      </div>
    </header>
  )
}
