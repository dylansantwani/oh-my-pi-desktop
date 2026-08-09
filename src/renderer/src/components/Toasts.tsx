import React from 'react'
import { useAppStore } from '../store'

export function Toasts(): React.JSX.Element {
  const toasts = useAppStore((s) => s.toasts)
  return (
    // Toasts vanish after 6s, so they have to announce themselves. The container
    // is polite; an error overrides that with role="alert" for its own subtree.
    <div className="toasts" role="status" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : undefined}>
          {t.text}
        </div>
      ))}
    </div>
  )
}
