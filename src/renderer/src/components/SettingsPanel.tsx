import React, { useEffect, useRef, useState } from 'react'
import { X, RotateCcw } from 'lucide-react'
import type { AppSettings, ThemeMode } from '../../../shared/omp-api'
import '../styles/settings.css'

const THEMES: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' }
]

function Toggle({
  label,
  hint,
  checked,
  onChange
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (v: boolean) => void
}): React.JSX.Element {
  return (
    <label className="settings-row">
      <span className="settings-row-text">
        <span className="settings-label">{label}</span>
        <span className="settings-hint">{hint}</span>
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }): React.JSX.Element | null {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [detectedPath, setDetectedPath] = useState('')
  const [pathDraft, setPathDraft] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreFocusTo = useRef<Element | null>(null)

  useEffect(() => {
    if (!open) return
    void (async () => {
      const s = await window.omp.getSettings()
      setSettings(s)
      setPathDraft(s.ompPathOverride ?? '')
      setDetectedPath(await window.omp.getOmpPath())
    })()
  }, [open])

  // aria-modal hides the rest of the page from assistive tech, so leaving focus
  // outside stranded a screen reader on an element it could no longer read —
  // and Tab could still walk into the app behind the panel.
  useEffect(() => {
    if (!open) return
    restoreFocusTo.current = document.activeElement
    panelRef.current?.focus()
    return () => {
      const prev = restoreFocusTo.current
      if (prev instanceof HTMLElement) prev.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusable = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  // Every write goes through main and comes back sanitized, so the panel shows
  // the value that was actually persisted rather than the one that was typed.
  const patch = async (p: Partial<AppSettings>): Promise<void> => {
    setSettings(await window.omp.updateSettings(p))
  }

  return (
    <div className="settings-backdrop" onMouseDown={onClose} role="presentation">
      <div
        className="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="settings-head">
          <h2>Settings</h2>
          <button className="settings-close" onClick={onClose} aria-label="Close settings">
            <X size={16} />
          </button>
        </header>

        {settings === null ? (
          <p className="settings-loading">Loading…</p>
        ) : (
          <div className="settings-body">
            <section>
              <h3>Appearance</h3>
              <div className="settings-row">
                <span className="settings-row-text">
                  <span className="settings-label">Theme</span>
                  <span className="settings-hint">System follows your OS setting.</span>
                </span>
                <div className="settings-segmented" role="group" aria-label="Theme">
                  {THEMES.map((t) => (
                    <button
                      key={t.value}
                      className={settings.theme === t.value ? 'on' : ''}
                      aria-pressed={settings.theme === t.value}
                      onClick={() => void patch({ theme: t.value })}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="settings-row">
                <span className="settings-row-text">
                  <span className="settings-label">Text size</span>
                  <span className="settings-hint">{settings.fontSize}px</span>
                </span>
                <input
                  type="range"
                  min={11}
                  max={20}
                  step={1}
                  value={settings.fontSize}
                  onChange={(e) => void patch({ fontSize: Number(e.target.value) })}
                />
              </label>
            </section>

            <section>
              <h3>Behavior</h3>
              <Toggle
                label="Notify when a turn finishes"
                hint="Only fires while the window is in the background."
                checked={settings.notifyOnTurnEnd}
                onChange={(v) => void patch({ notifyOnTurnEnd: v })}
              />
              <Toggle
                label="Check for updates automatically"
                hint="Takes effect the next time the app starts."
                checked={settings.autoCheckUpdates}
                onChange={(v) => void patch({ autoCheckUpdates: v })}
              />
            </section>

            <section>
              <h3>Agent</h3>
              <div className="settings-row settings-row-stack">
                <span className="settings-row-text">
                  <span className="settings-label">omp binary</span>
                  <span className="settings-hint">
                    Leave blank to auto-detect. Currently using <code>{detectedPath || 'omp'}</code>.
                  </span>
                </span>
                <div className="settings-path">
                  <input
                    type="text"
                    value={pathDraft}
                    placeholder="Auto-detect"
                    spellCheck={false}
                    onChange={(e) => setPathDraft(e.target.value)}
                    onBlur={() => void patch({ ompPathOverride: pathDraft.trim() || null })}
                  />
                </div>
                <span className="settings-hint">Restart the app for a path change to take effect.</span>
              </div>
            </section>
          </div>
        )}

        <footer className="settings-foot">
          <button
            className="settings-reset"
            onClick={() => {
              void (async () => {
                const s = await window.omp.resetSettings()
                setSettings(s)
                setPathDraft(s.ompPathOverride ?? '')
              })()
            }}
          >
            <RotateCcw size={13} /> Reset to defaults
          </button>
          <button className="settings-done" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  )
}
