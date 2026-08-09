import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../store'
import { Search, CornerDownLeft } from 'lucide-react'

interface PaletteItem {
  id: string
  label: string
  keywords: string
  run: () => void
}

const ACTIONS: PaletteItem[] = [
  { id: 'new', label: 'New session', keywords: 'create start', run: () => void useAppStore.getState().newSession() },
  { id: 'project', label: 'Change project', keywords: 'folder open choose', run: () => void useAppStore.getState().pickProjectAndConnect() },
  { id: 'export', label: 'Export session to HTML', keywords: 'save share', run: () => void useAppStore.getState().exportHtml() },
  { id: 'refresh', label: 'Refresh state', keywords: 'reload sync model', run: () => void useAppStore.getState().refreshState() },
  // These three had no route into them except the menu bar, which Windows
  // hides behind Alt.
  { id: 'find', label: 'Find in transcript', keywords: 'search locate text', run: () => useAppStore.getState().setSearchOpen(true) },
  { id: 'panel', label: 'Toggle side panel', keywords: 'todos files context hide show', run: () => useAppStore.getState().toggleRightPanel() },
  { id: 'settings', label: 'Settings', keywords: 'preferences theme font size omp path update', run: () => useAppStore.getState().setSettingsOpen(true) }
]

export function CommandPalette(): React.JSX.Element | null {
  const open = useAppStore((s) => s.paletteOpen)
  const sessions = useAppStore((s) => s.sessions)
  const fastMode = useAppStore((s) => s.fastMode)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      // Focus on the next frame so the overlay has mounted.
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  useEffect(() => {
    setActive(0)
  }, [query])

  // .palette-list caps at 340px and scrolls, but the highlight moved with the
  // arrow keys while the list stayed put — past ~10 results the selection went
  // off screen.
  useEffect(() => {
    listRef.current?.querySelector('.palette-item.active')?.scrollIntoView({ block: 'nearest' })
  }, [active, query])

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    const match = (i: PaletteItem): boolean => !q || `${i.label} ${i.keywords}`.toLowerCase().includes(q)
    const actions = [...ACTIONS, { id: 'fast', label: fastMode ? 'Turn fast mode off' : 'Turn fast mode on', keywords: 'speed zap toggle', run: () => { const s = useAppStore.getState(); void s.setFastMode(!s.fastMode) } }]
    const sessionItems: PaletteItem[] = sessions.map((s) => ({
      id: s.path,
      label: s.title,
      keywords: `${s.cwd} session`,
      run: () => void useAppStore.getState().switchSession(s.path)
    }))
    return {
      actions: actions.filter(match),
      sessions: sessionItems.filter(match)
    }
  }, [query, sessions, fastMode])

  if (!open) return null

  const close = (): void => {
    void useAppStore.getState().setPaletteOpen(false)
  }

  const runActive = (): void => {
    const list = [...items.actions, ...items.sessions]
    const item = list[Math.min(active, list.length - 1)]
    if (!item) return
    close()
    item.run()
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    const total = items.actions.length + items.sessions.length
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, total - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      runActive()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  return (
    <div className="palette-backdrop" onClick={close} role="presentation">
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="palette-input-row">
          <Search size={15} className="palette-search-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            className="palette-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a command or search sessions…"
            aria-label="Type a command or search sessions"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={`palette-item-${active}`}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {items.actions.length > 0 && (
            <>
              <div className="palette-section">Actions</div>
              {items.actions.map((item, i) => (
                <PaletteRow key={item.id} item={item} index={i} active={i === active} onHover={() => setActive(i)} onRun={() => { close(); item.run() }} />
              ))}
            </>
          )}
          {items.sessions.length > 0 && (
            <>
              <div className="palette-section">Sessions</div>
              {items.sessions.map((item, i) => (
                <PaletteRow key={item.id} item={item} index={items.actions.length + i} active={items.actions.length + i === active} onHover={() => setActive(items.actions.length + i)} onRun={() => { close(); item.run() }} />
              ))}
            </>
          )}
          {items.actions.length === 0 && items.sessions.length === 0 && <div className="palette-empty">No matches</div>}
        </div>
        <div className="palette-footer">
          <span className="palette-hint">
            <CornerDownLeft size={11} /> select
          </span>
        </div>
      </div>
    </div>
  )
}

function PaletteRow({ item, index, active, onHover, onRun }: { item: PaletteItem; index: number; active: boolean; onHover: () => void; onRun: () => void }): React.JSX.Element {
  return (
    <button
      id={`palette-item-${index}`}
      role="option"
      aria-selected={active}
      className={`palette-item ${active ? 'active' : ''}`}
      onMouseEnter={onHover}
      onClick={onRun}
    >
      <span className="ellipsis">{item.label}</span>
    </button>
  )
}
