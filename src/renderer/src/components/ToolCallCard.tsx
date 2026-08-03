import React, { useState } from 'react'
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronRight } from 'lucide-react'
import type { ToolCallView } from '../lib/transcript'

export function ToolCallCard({ tool }: { tool: ToolCallView }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const Icon = tool.status === 'running' ? Loader2 : tool.status === 'ok' ? CheckCircle2 : XCircle
  return (
    <div className={`tool-card ${tool.status}`}>
      <button className="tool-card-head" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Icon size={14} className="tool-icon" />
        <code>{tool.name}</code>
        <span className="tool-status">{tool.status}</span>
      </button>
      {open && (
        <div className="tool-card-body">
          <pre>{JSON.stringify(tool.args, null, 2)}</pre>
          {tool.error !== undefined && <pre className="tool-error">{tool.error}</pre>}
          {tool.result !== undefined && tool.error === undefined && <pre>{typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result, null, 2)}</pre>}
        </div>
      )}
    </div>
  )
}
