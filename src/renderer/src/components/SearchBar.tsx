import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore, searchMatches } from '../store'
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react'
import '../styles/search.css'

/** How long typing has to settle before the transcript is re-scanned. A long
 *  session holds thousands of messages, so scanning per keystroke is wasted
 *  work — this sits under the ~200ms where a find bar starts to feel laggy. */
export const SEARCH_DEBOUNCE_MS = 160

export function SearchBar(): React.JSX.Element | null {
  const open = useAppStore((s) => s.searchOpen)
  const query = useAppStore((s) => s.searchQuery)
  const matchIndex = useAppStore((s) => s.searchMatchIndex)
  const messages = useAppStore((s) => s.messages)
  // The input is uncontrolled by the store on purpose: typing must feel
  // instant, while the store only sees the settled query.
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setDraft('')
    // Focus on the next frame so the overlay has mounted.
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  useEffect(() => {
    if (draft === query) return
    const t = setTimeout(() => useAppStore.getState().setSearchQuery(draft), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [draft, query])

  const total = useMemo(() => searchMatches(messages, query).length, [messages, query])

  if (!open) return null

  const close = (): void => useAppStore.getState().setSearchOpen(false)
  const step = (delta: number): void => useAppStore.getState().stepSearchMatch(delta)

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      // Enter means "go now", so flush a pending debounce instead of making the
      // user wait it out. That flush already lands on match 1; only step once
      // the store is showing the query the user is looking at.
      if (draft !== query) {
        useAppStore.getState().setSearchQuery(draft)
        return
      }
      step(e.shiftKey ? -1 : 1)
    }
  }

  const count = !query.trim() ? '' : total === 0 ? 'No matches' : `${matchIndex + 1} of ${total}`

  return (
    <div className="search-bar">
      <Search size={14} className="search-icon" />
      <input
        ref={inputRef}
        className="search-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Find in transcript…"
        aria-label="Find in transcript"
      />
      <span className="search-count">{count}</span>
      <button className="search-btn" onClick={() => step(-1)} disabled={total === 0} aria-label="Previous match" title="Previous match (Shift+Enter)">
        <ChevronUp size={14} />
      </button>
      <button className="search-btn" onClick={() => step(1)} disabled={total === 0} aria-label="Next match" title="Next match (Enter)">
        <ChevronDown size={14} />
      </button>
      <button className="search-btn" onClick={close} aria-label="Close search" title="Close (Esc)">
        <X size={14} />
      </button>
    </div>
  )
}
