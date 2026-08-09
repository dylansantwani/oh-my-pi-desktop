import React, { useMemo, useState } from 'react'
import { diffStat, type DiffHunk, type DiffRow, type DiffStat } from '../lib/diff'
import '../styles/diff.css'

// A big write would otherwise push the rest of the transcript off screen, so
// anything past COLLAPSE_AT opens as a preview with a toggle.
const COLLAPSE_AT = 40
const PREVIEW_ROWS = 18

const SIGN: Record<DiffRow['kind'], string> = { add: '+', del: '-', ctx: ' ' }

type DiffItem = { kind: 'sep'; text: string } | { kind: 'row'; row: DiffRow }

export function DiffStatPill({ stat }: { stat: DiffStat }): React.JSX.Element {
  return (
    <span className="diff-stat" title={`${stat.added} added, ${stat.removed} removed`}>
      <span className="diff-stat-add">+{stat.added}</span>
      <span className="diff-stat-del">−{stat.removed}</span>
    </span>
  )
}

export function DiffView({ path, hunks, degraded = false }: { path: string; hunks: DiffHunk[]; degraded?: boolean }): React.JSX.Element {
  const [showAll, setShowAll] = useState(false)
  const items = useMemo(() => flatten(hunks), [hunks])
  const stat = useMemo(() => diffStat(hunks), [hunks])
  const lineCount = hunks.reduce((n, h) => n + h.rows.length, 0)
  const collapsible = items.length > COLLAPSE_AT
  const visible = collapsible && !showAll ? items.slice(0, PREVIEW_ROWS) : items

  return (
    <div className="diff">
      <div className="diff-head">
        {path !== '' && (
          <span className="diff-path" title={path}>
            {path}
          </span>
        )}
        <DiffStatPill stat={stat} />
      </div>
      {degraded && <div className="diff-note">Too large to align line by line — showing the whole block as a replace.</div>}
      <div className="diff-body">
        {visible.map((item, i) =>
          item.kind === 'sep' ? (
            <div key={`s${i}`} className="diff-sep">
              {item.text}
            </div>
          ) : (
            <div key={`r${i}`} className={`diff-row ${item.row.kind}`}>
              <span className="diff-ln">{item.row.oldLine ?? ''}</span>
              <span className="diff-ln">{item.row.newLine ?? ''}</span>
              <span className="diff-sign">{SIGN[item.row.kind]}</span>
              <span className="diff-text">{item.row.text}</span>
            </div>
          )
        )}
      </div>
      {collapsible && (
        <button className="diff-toggle" onClick={() => setShowAll((s) => !s)}>
          {showAll ? 'Show less' : `Show all ${lineCount} lines`}
        </button>
      )}
    </div>
  )
}

// Hunks become one flat list so the collapse can slice across hunk boundaries.
function flatten(hunks: DiffHunk[]): DiffItem[] {
  const items: DiffItem[] = []
  for (const h of hunks) {
    // Only worth a separator once there is a gap to explain.
    if (hunks.length > 1) items.push({ kind: 'sep', text: `@@ -${h.oldStart},${h.oldCount} +${h.newStart},${h.newCount} @@` })
    for (const row of h.rows) items.push({ kind: 'row', row })
  }
  return items
}
