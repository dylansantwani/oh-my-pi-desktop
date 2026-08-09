import React from 'react'
import { useAppStore } from '../store'
import { FileCode, FileJson, FileText, File, Pencil } from 'lucide-react'

function iconFor(name: string): React.JSX.Element {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'json') return <FileJson size={14} />
  if (['ts', 'tsx', 'js', 'jsx', 'css', 'html', 'py', 'rs', 'go', 'md'].includes(ext ?? '')) return <FileCode size={14} />
  if (ext) return <FileText size={14} />
  return <File size={14} />
}

export function FilesPanel(): React.JSX.Element {
  const files = useAppStore((s) => s.sessionFiles)
  const setOpenFile = useAppStore((s) => s.setOpenFile)
  if (files.length === 0) return <div className="panel-empty">Files the agent touches this session will show up here.</div>
  return (
    <div className="files-panel">
      {files.map((f) => (
        <button
          key={f.path}
          className="file-row"
          onClick={() => setOpenFile(f.path)}
          title={f.path}
          // The badge is colour plus an icon, so the edited state rides on the name.
          aria-label={f.modified ? `${f.name}, edited this session` : f.name}
        >
          <span className="file-icon">{iconFor(f.name)}</span>
          <span className="ellipsis file-name">{f.name}</span>
          {f.modified && (
            <span className="modified-badge" title="Modified this session">
              <Pencil size={10} /> edited
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
