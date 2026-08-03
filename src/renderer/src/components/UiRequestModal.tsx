import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store'

interface UiRequest {
  id: string
  method: 'confirm' | 'select' | 'input' | 'editor' | 'notify' | string
  title?: string
  message?: string
  placeholder?: string
  options?: Array<string | { label: string; value: string }>
  timeout?: number
  defaultValue?: string
  content?: string
}

export function UiRequestModal(): React.JSX.Element | null {
  const req = useAppStore((s) => s.uiRequest) as UiRequest | null
  const answerUi = useAppStore((s) => s.answerUi)
  const [value, setValue] = useState('')
  const [selected, setSelected] = useState('')

  useEffect(() => {
    if (!req) return
    setValue(req.defaultValue ?? req.content ?? '')
    const first = Array.isArray(req.options) ? req.options[0] : undefined
    setSelected(typeof first === 'string' ? first : first?.value ?? '')
    if (req.method === 'notify' && typeof req.timeout === 'number') {
      const t = setTimeout(() => void answerUi(req.id, undefined, undefined, true), req.timeout)
      return () => clearTimeout(t)
    }
  }, [req, answerUi])

  if (!req) return null

  const opts = Array.isArray(req.options)
    ? req.options.map((o) => (typeof o === 'string' ? { label: o, value: o } : o))
    : []

  const close = (cancelled: boolean): void => {
    void answerUi(req.id, value, !cancelled, cancelled)
  }

  return (
    <div className="modal">
      <div className="modal-box">
        <h2>{req.title ?? 'Oh My Pi'}</h2>
        {req.message && <p className="modal-message">{req.message}</p>}
        {req.method === 'confirm' && (
          <div className="modal-actions">
            <button className="btn" onClick={() => close(true)}>
              Cancel
            </button>
            <button className="btn primary" onClick={() => close(false)}>
              OK
            </button>
          </div>
        )}
        {req.method === 'input' && (
          <>
            <input
              className="modal-input"
              autoFocus
              value={value}
              placeholder={req.placeholder ?? ''}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && close(false)}
            />
            <div className="modal-actions">
              <button className="btn" onClick={() => close(true)}>
                Cancel
              </button>
              <button className="btn primary" onClick={() => close(false)}>
                OK
              </button>
            </div>
          </>
        )}
        {req.method === 'editor' && (
          <>
            <textarea
              className="modal-editor"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <div className="modal-actions">
              <button className="btn" onClick={() => close(true)}>
                Cancel
              </button>
              <button className="btn primary" onClick={() => close(false)}>
                Save
              </button>
            </div>
          </>
        )}
        {req.method === 'select' && (
          <>
            <div className="modal-options">
              {opts.map((o) => (
                <button
                  key={o.value}
                  className={`option ${selected === o.value ? 'selected' : ''}`}
                  onClick={() => {
                    setSelected(o.value)
                    void answerUi(req.id, o.value, true)
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => close(true)}>
                Cancel
              </button>
            </div>
          </>
        )}
        {req.method === 'notify' && (
          <div className="modal-actions">
            <button className="btn primary" onClick={() => close(false)}>
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
