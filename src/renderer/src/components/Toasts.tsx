import React from 'react'
import { useAppStore } from '../store'

export function Toasts(): React.JSX.Element {
  const toasts = useAppStore((s) => s.toasts)
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  )
}
