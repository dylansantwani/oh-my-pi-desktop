import React, { useEffect, useRef, useState } from 'react'
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

/** Confirmations are the one place the agent asks permission, and the thing it
 *  is asking about is usually a command or a path. Rendering that in the UI's
 *  sans-serif prose font made `rm -rf ./dist` look like a sentence, so any
 *  indented or fenced-looking line is pulled out and shown as code. */
function Message({ text }: { text: string }): React.JSX.Element {
  const blocks = text.split(/\n{2,}/).filter((b) => b.length > 0)
  return (
    <div className="modal-message">
      {blocks.map((block, i) =>
        /^\s{2,}\S/.test(block) ? (
          <pre key={i} className="modal-code">
            {block.replace(/^\n+|\n+$/g, '').replace(/^ {2}/gm, '')}
          </pre>
        ) : (
          <p key={i}>{block}</p>
        )
      )}
    </div>
  )
}

export function UiRequestModal(): React.JSX.Element | null {
  const req = useAppStore((s) => s.uiRequest) as UiRequest | null
  const answerUi = useAppStore((s) => s.answerUi)
  const [value, setValue] = useState('')
  const [selected, setSelected] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const restoreFocusTo = useRef<Element | null>(null)

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

  // Focus used to stay wherever it was — usually the composer, which is
  // autoFocused — so a blocking permission dialog could be sitting on screen
  // while Enter sent a fresh prompt to the agent behind it.
  useEffect(() => {
    if (!req) return
    restoreFocusTo.current = document.activeElement
    const target = confirmRef.current ?? boxRef.current
    target?.focus()
    return () => {
      const prev = restoreFocusTo.current
      if (prev instanceof HTMLElement) prev.focus()
    }
  }, [req])

  // Escape cancels. The global handler in App.tsx only knows about search and
  // the palette, so without this the dialog could not be dismissed by keyboard
  // at all. Tab is kept inside the box so the page behind stays unreachable.
  useEffect(() => {
    if (!req) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        void answerUi(req.id, undefined, false, true)
        return
      }
      if (e.key !== 'Tab') return
      const box = boxRef.current
      if (!box) return
      const focusable = box.querySelectorAll<HTMLElement>(
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
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [req, answerUi])

  if (!req) return null

  const opts = Array.isArray(req.options)
    ? req.options.map((o) => (typeof o === 'string' ? { label: o, value: o } : o))
    : []

  const close = (cancelled: boolean): void => {
    void answerUi(req.id, value, !cancelled, cancelled)
  }

  const title = req.title ?? 'Oh My Pi'

  return (
    <div className="modal" role="presentation">
      <div className="modal-box" role="dialog" aria-modal="true" aria-labelledby="ui-request-title" ref={boxRef} tabIndex={-1}>
        <h2 id="ui-request-title">{title}</h2>
        {req.message && <Message text={req.message} />}
        {req.method === 'confirm' && (
          <div className="modal-actions">
            <button className="btn" onClick={() => close(true)}>
              Cancel
            </button>
            {/* "Allow" rather than "OK": the agent is asking for permission, and
                the answer should read like one either way it is skimmed. */}
            <button className="btn primary" ref={confirmRef} onClick={() => close(false)}>
              Allow
            </button>
          </div>
        )}
        {req.method === 'input' && (
          <>
            <input
              className="modal-input"
              autoFocus
              aria-label={title}
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
              aria-label={title}
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
            <div className="modal-options" role="group" aria-label={title}>
              {opts.map((o, i) => (
                <button
                  key={o.value}
                  ref={i === 0 ? confirmRef : undefined}
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
            <button className="btn primary" ref={confirmRef} onClick={() => close(false)}>
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
