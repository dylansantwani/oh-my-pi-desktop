import React, { useMemo, useState } from 'react'
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronRight } from 'lucide-react'
import type { ToolCallView } from '../lib/transcript'
import { DiffStatPill, DiffView } from './DiffView'
import { diffLines, diffStat, extractDiff } from '../lib/diff'

// Arg keys worth showing on the collapsed row, most specific first. A card that
// says only `read` forces a click to learn *what* was read, which is the one
// thing you want while skimming a long transcript.
const SUMMARY_KEYS = ['path', 'file_path', 'filePath', 'file', 'filename', 'command', 'cmd', 'pattern', 'query', 'url']

function summarize(args: unknown): string | null {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return null
  const rec = args as Record<string, unknown>
  for (const key of SUMMARY_KEYS) {
    const v = rec[key]
    if (typeof v === 'string' && v.trim()) return v.trim().replace(/\s+/g, ' ')
  }
  return null
}

export function ToolCallCard({ tool }: { tool: ToolCallView }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const summary = useMemo(() => summarize(tool.args), [tool.args])
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
      <button className="tool-card-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
        <Icon size={14} className="tool-icon" aria-hidden="true" />
        <code>{tool.name}</code>
        {summary && (
          <span className="tool-summary ellipsis" title={summary}>
            {summary}
          </span>
        )}
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
