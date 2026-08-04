export interface SessionInfo {
  path: string
  title: string
  cwd: string
  mtimeMs: number
  sizeBytes: number
}

export type SessionGroup = { label: 'Today' | 'Yesterday' | 'Previous 7 days' | 'Older'; items: SessionInfo[] }
const DAY = 24 * 60 * 60 * 1000

export function groupSessionsByDay(sessions: SessionInfo[], now: Date = new Date()): SessionGroup[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const buckets: Record<string, SessionInfo[]> = { Today: [], Yesterday: [], 'Previous 7 days': [], Older: [] }
  for (const s of sessions) {
    if (!Number.isFinite(s.mtimeMs) || s.mtimeMs <= 0) {
      buckets.Older.push(s)
      continue
    }
    const d = new Date(s.mtimeMs)
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const diffDays = Math.round((today - dayStart) / DAY)
    const label = diffDays <= 0 ? 'Today' : diffDays === 1 ? 'Yesterday' : diffDays <= 7 ? 'Previous 7 days' : 'Older'
    buckets[label].push(s)
  }
  const order: Array<SessionGroup['label']> = ['Today', 'Yesterday', 'Previous 7 days', 'Older']
  return order
    .map((label) => ({ label, items: buckets[label].sort((a, b) => b.mtimeMs - a.mtimeMs) }))
    .filter((g) => g.items.length > 0)
}
