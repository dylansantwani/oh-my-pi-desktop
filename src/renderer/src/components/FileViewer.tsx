import React, { useEffect, useState } from 'react'
import hljs from 'highlight.js'
import { useAppStore } from '../store'
import { X, FileWarning } from 'lucide-react'
import type { ReadFileResult } from '../../../shared/omp-api'

export function FileViewer(): React.JSX.Element | null {
  const path = useAppStore((s) => s.openFilePath)
  const setOpenFile = useAppStore((s) => s.setOpenFile)
  const [state, setState] = useState<{ loading: boolean } | ReadFileResult>({ loading: true })

  useEffect(() => {
    if (!path) return
    setState({ loading: true })
    void window.omp.readFile(path).then(setState)
  }, [path])

  if (!path) return null
  const name = path.split(/[\\/]/).pop() ?? path
  const ext = name.split('.').pop()?.toLowerCase() ?? ''

  return (
    <div className="file-viewer-overlay" onClick={() => setOpenFile(null)}>
      <div className="file-viewer" onClick={(e) => e.stopPropagation()}>
        <div className="file-viewer-head">
          <span className="file-viewer-name">{name}</span>
          <span className="file-viewer-path">{path}</span>
          <button className="icon-btn" onClick={() => setOpenFile(null)} title="Close">
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
