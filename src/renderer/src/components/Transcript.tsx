import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore, searchMatches } from '../store'
import { MessageView } from './MessageView'

/** How close to the bottom still counts as "following the stream". */
const PINNED_SLACK_PX = 80

/** `.transcript` sets `scroll-behavior: smooth`, and that applies to
 *  programmatic scrolls too — including a plain `scrollTop =` assignment. So
 *  every attempt to follow the stream was queued as an animation, and a
 *  transcript that is still rendering cancels it: the view simply never moved.
 *  `behavior: 'instant'` is the one form that overrides the CSS property. */
function scrollToBottomNow(el: HTMLElement): void {
  el.scrollTo({ top: el.scrollHeight, behavior: 'instant' })
}

/** An empty transcript used to be one grey sentence adrift in ~700px of dead
 *  space. It is also the first thing a new user sees, so it carries the two
 *  facts that matter — which project the agent is pointed at, and how to get
 *  moving — instead of nothing. */
function EmptyState(): React.JSX.Element {
  const project = useAppStore((s) => s.project)
  const connected = useAppStore((s) => s.status) === 'connected'
  const isMac = window.omp?.platform === 'darwin'
  const k = isMac ? '⌘' : 'Ctrl+'
  return (
    <div className="empty-state">
      <div className="brand-mark" aria-hidden="true">
        π
      </div>
      <h2>{connected ? 'Ready when you are' : 'Not connected to an agent'}</h2>
      {project ? (
        <p className="empty-project" title={project}>
          Working in <code>{project.split(/[\\/]/).filter(Boolean).pop() ?? project}</code>
        </p>
      ) : (
        <p className="empty-project">Choose a project folder to point the agent at.</p>
      )}
      {connected ? (
        <p className="empty-hint">Describe a task below, or pick an earlier session on the left.</p>
      ) : (
        <button className="btn primary" onClick={() => void useAppStore.getState().pickProjectAndConnect()}>
          Choose a project…
        </button>
      )}
      <ul className="empty-shortcuts">
        <li>
          <kbd>{k}K</kbd> commands
        </li>
        <li>
          <kbd>{k}N</kbd> new session
        </li>
        <li>
          <kbd>{k}F</kbd> find in transcript
        </li>
      </ul>
    </div>
  )
}

export function Transcript(): React.JSX.Element {
  const messages = useAppStore((s) => s.messages)
  const isStreaming = useAppStore((s) => s.isStreaming)
  const searchOpen = useAppStore((s) => s.searchOpen)
  const searchQuery = useAppStore((s) => s.searchQuery)
  const searchMatchIndex = useAppStore((s) => s.searchMatchIndex)
  const activeSessionPath = useAppStore((s) => s.activeSessionPath)
  const canLoadOlder = useAppStore((s) => s.canLoadOlder)
  const loadingOlder = useAppStore((s) => s.loadingOlder)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const activeMatchRef = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const [showJump, setShowJump] = useState(false)
  // A user bubble with no agent reply (rejected prompt) should offer recovery,
  // but only once it's clearly stale — agent_start usually lands within a beat.
  const [showRecoveryHint, setShowRecoveryHint] = useState(false)

  /** The viewport moved. Whether the reader is still following is simply how
   *  close to the bottom they ended up — auto-follow scrolls instantly and lands
   *  exactly at the bottom, so its own events read as pinned and cannot be
   *  mistaken for the reader walking away. */
  const onScroll = useCallback((): void => {
    const el = scrollerRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    pinned.current = distance < PINNED_SLACK_PX
    setShowJump(!pinned.current && el.scrollHeight > el.clientHeight)
  }, [])

  /** Reading back through the transcript has to survive the next delta landing.
   *  Chromium coalesces scroll events onto animation frames, so a burst of
   *  incoming text can re-stick the view before the reader's own scroll is ever
   *  delivered — an upward wheel or trackpad gesture is the intent itself, and
   *  is not subject to that delay. */
  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>): void => {
    if (e.deltaY >= 0) return
    const el = scrollerRef.current
    if (!el) return
    pinned.current = false
    setShowJump(el.scrollHeight > el.clientHeight)
  }, [])

  /** The content changed shape under a viewport that did not move. This must
   *  *maintain* the pin rather than re-judge it: a reply grows for a while after
   *  its first frame (markdown, code blocks, diffs), and treating that growth as
   *  "the reader has scrolled away" is what stopped the transcript following
   *  along. showJump is recomputed here too, so it can no longer go stale when
   *  the transcript changes without a scroll event. */
  const stickToBottom = useCallback((): void => {
    const el = scrollerRef.current
    if (!el) return
    if (pinned.current) scrollToBottomNow(el)
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    setShowJump(distance >= PINNED_SLACK_PX && el.scrollHeight > el.clientHeight)
  }, [])

  useEffect(() => {
    stickToBottom()
  }, [messages, stickToBottom])

  // Scroll events are not the only thing that changes whether there is anything
  // to scroll to: the window resizes, the side panel collapses, a code block
  // reflows. Without this the button could latch on from an earlier layout and
  // sit over a transcript that already fits. (jsdom has no ResizeObserver.)
  useEffect(() => {
    const el = scrollerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => stickToBottom())
    ro.observe(el)
    for (const child of Array.from(el.children)) ro.observe(child)
    return () => ro.disconnect()
  }, [messages, stickToBottom])

  // A fresh session starts pinned to the newest message; carrying the previous
  // session's scroll state over left the new transcript parked mid-history.
  useEffect(() => {
    pinned.current = true
    setShowJump(false)
    const el = scrollerRef.current
    if (el) scrollToBottomNow(el)
  }, [activeSessionPath])

  const matches = useMemo(
    () => (searchOpen ? searchMatches(messages, searchQuery) : []),
    [searchOpen, messages, searchQuery]
  )
  const matchIds = useMemo(() => new Set(matches), [matches])
  // The store's index can outrun the match list when the transcript grows or
  // shrinks under an open search, so clamp rather than render nothing.
  const activeMatchId = matches.length > 0 ? matches[Math.min(searchMatchIndex, matches.length - 1)] : null

  useEffect(() => {
    if (!activeMatchId) return
    activeMatchRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeMatchId])

  useEffect(() => {
    if (isStreaming || messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      setShowRecoveryHint(false)
      return
    }
    const t = setTimeout(() => setShowRecoveryHint(true), 1200)
    return () => clearTimeout(t)
  }, [messages, isStreaming])

  // Instant, like the auto-follow: a smooth animation here can be cut short by
  // the next delta landing mid-flight, leaving the reader stranded somewhere in
  // between after they explicitly asked to be at the bottom.
  const jumpToBottom = (): void => {
    pinned.current = true
    setShowJump(false)
    const el = scrollerRef.current
    if (el) scrollToBottomNow(el)
  }

  // Paging back used to be unreachable: the store fetched 100 messages and kept
  // a cursor nothing ever spent, so anything older was invisible.
  const loadOlder = (): void => {
    const el = scrollerRef.current
    const before = el?.scrollHeight ?? 0
    void useAppStore
      .getState()
      .loadOlder()
      .then(() => {
        // Prepending shifts everything down; hold the reader's place instead of
        // yanking them to the top of the newly inserted page.
        if (!el) return
        el.scrollTop += el.scrollHeight - before
      })
  }

  return (
    // The find bar is absolutely positioned over the top of this column, so the
    // first message needs to move out from under it while it is open.
    <div
      className={searchOpen ? 'transcript is-searching' : 'transcript'}
      ref={scrollerRef}
      onScroll={onScroll}
      onWheel={onWheel}
    >
      {canLoadOlder && (
        <button className="load-older" onClick={loadOlder} disabled={loadingOlder}>
          {loadingOlder ? 'Loading…' : 'Load older messages'}
        </button>
      )}
      {messages.length === 0 && !isStreaming && <EmptyState />}
      {/* A turn that starts before any message exists would otherwise render as
          a lone 8px dot in an empty column, with the empty state suppressed
          behind it and nothing saying what it meant. */}
      {messages.length === 0 && isStreaming && <div className="empty-hint">Waiting for the agent…</div>}
      {showRecoveryHint && (
        <div className="empty-hint">
          The agent didn't reply to your last message — it may have rejected the prompt. Try again, or switch sessions on the left.
        </div>
      )}
      {messages.map((m) => {
        const active = m.id === activeMatchId
        return (
          <div
            key={m.id}
            ref={active ? activeMatchRef : null}
            className={`transcript-row${matchIds.has(m.id) ? ' search-hit' : ''}${active ? ' search-hit-active' : ''}`}
          >
            <MessageView message={m} />
          </div>
        )
      })}
      {isStreaming && messages.length > 0 && <div className="streaming-dot" />}
      {showJump && (
        <button className="jump-btn" onClick={jumpToBottom} title="Scroll to bottom" aria-label="Scroll to newest message">
          ↓
        </button>
      )}
    </div>
  )
}
