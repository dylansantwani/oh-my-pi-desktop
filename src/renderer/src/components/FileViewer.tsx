import React, { useEffect, useRef, useState } from 'react'
import hljs from 'highlight.js'
import { useAppStore } from '../store'
import { X, FileWarning } from 'lucide-react'
import type { ReadFileResult } from '../../../shared/omp-api'

export function FileViewer(): React.JSX.Element | null {
  const path = useAppStore((s) => s.openFilePath)
  const setOpenFile = useAppStore((s) => s.setOpenFile)
  const [state, setState] = useState<{ loading: boolean } | ReadFileResult>({ loading: true })
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!path) return
    setState({ loading: true })
    void window.omp.readFile(path).then(setState)
  }, [path])

  // The viewer is modal, so it takes focus while it is open and hands it back to
  // whatever opened it (usually a file row) once it closes — otherwise keyboard
  // users are dropped back at the top of the document.
  useEffect(() => {
    if (!path) return
    const opener = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    return () => opener?.focus?.()
  }, [path])

  // App.tsx's global Escape handler only knows about search and the palette.
  useEffect(() => {
    if (!path) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpenFile(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [path, setOpenFile])

  if (!path) return null
  const name = path.split(/[\\/]/).pop() ?? path
  const ext = name.split('.').pop()?.toLowerCase() ?? ''

  return (
    <div className="file-viewer-overlay" onClick={() => setOpenFile(null)} role="presentation">
      <div
        className="file-viewer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-viewer-title"
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="file-viewer-head">
          <span className="file-viewer-name" id="file-viewer-title">
            {name}
          </span>
          <span className="file-viewer-path">{path}</span>
          <button className="icon-btn" onClick={() => setOpenFile(null)} title="Close" aria-label="Close file viewer">
            <X size={14} />
          </button>
        </div>
        <div className="file-viewer-body">
          {'loading' in state && state.loading && <div className="panel-empty">Loading…</div>}
          {'ok' in state && !state.ok && (
            <div className="file-error">
              <FileWarning size={14} /> {state.error}
            </div>
          )}
          {'ok' in state && state.ok && (
            <pre className="file-code">
              <code
                dangerouslySetInnerHTML={{
                  __html:
                    ext && hljs.getLanguage(ext)
                      ? hljs.highlight(state.content, { language: ext }).value
                      : hljs.highlightAuto(state.content).value
                }}
              />
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
