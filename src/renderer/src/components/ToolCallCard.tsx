import React, { useMemo, useState } from 'react'
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronRight } from 'lucide-react'
import type { ToolCallView } from '../lib/transcript'
import { DiffStatPill, DiffView } from './DiffView'
import { diffLines, diffStat, extractDiff } from '../lib/diff'

export function ToolCallCard({ tool }: { tool: ToolCallView }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const Icon = tool.status === 'running' ? Loader2 : tool.status === 'ok' ? CheckCircle2 : XCircle
  // File edits render as a diff; an arg shape we cannot read as one — or an
  // edit that changed nothing — keeps the raw-JSON fallback.
  const diff = useMemo(() => {
    const src = extractDiff(tool.name, tool.args)
    if (!src) return null
    const { hunks, degraded } = diffLines(src.oldText, src.newText)
    if (hunks.length === 0) return null
    return { path: src.path, hunks, degraded, stat: diffStat(hunks) }
  }, [tool.name, tool.args])
  return (
    <div className={`tool-card ${tool.status}`}>
      <button className="tool-card-head" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Icon size={14} className="tool-icon" />
        <code>{tool.name}</code>
        {diff && <DiffStatPill stat={diff.stat} />}
        <span className="tool-status">{tool.status}</span>
      </button>
      {open && (
        <div className="tool-card-body">
          {diff ? <DiffView path={diff.path} hunks={diff.hunks} degraded={diff.degraded} /> : <pre>{JSON.stringify(tool.args, null, 2)}</pre>}
          {tool.error !== undefined && <pre className="tool-error">{tool.error}</pre>}
          {tool.result !== undefined && tool.error === undefined && <pre>{typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result, null, 2)}</pre>}
        </div>
      )}
    </div>
  )
}
