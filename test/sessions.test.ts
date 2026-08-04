import { describe, expect, it } from 'vitest'
import { groupSessionsByDay, type SessionInfo } from '../src/renderer/src/lib/sessions'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-08-03T12:00:00Z')
function s(mtimeMs: number | null, title: string): SessionInfo {
  return { path: `/s/${title}`, title, cwd: '/proj', mtimeMs: mtimeMs ?? 0, sizeBytes: 1 }
}

describe('groupSessionsByDay', () => {
  it('buckets today / yesterday / previous 7 days / older', () => {
    const groups = groupSessionsByDay(
      [
        s(NOW.getTime(), 'today'),
        s(NOW.getTime() - DAY, 'yesterday'),
        s(NOW.getTime() - 3 * DAY, 'three-days'),
        s(NOW.getTime() - 30 * DAY, 'old')
      ],
      NOW
    )
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', 'Previous 7 days', 'Older'])
    expect(groups[0].items.map((i) => i.title)).toEqual(['today'])
    expect(groups[2].items.map((i) => i.title)).toEqual(['three-days'])
    expect(groups[3].items.map((i) => i.title)).toEqual(['old'])
  })
  it('sorts items newest-first within a group', () => {
    const groups = groupSessionsByDay(
      [s(NOW.getTime() - DAY - 2 * 60 * 60 * 1000, 'older-in-bucket'), s(NOW.getTime() - DAY, 'newer-in-bucket')],
      NOW
    )
    expect(groups[0].items.map((i) => i.title)).toEqual(['newer-in-bucket', 'older-in-bucket'])
  })
  it('drops groups with no items and puts null/invalid mtime in Older', () => {
    const groups = groupSessionsByDay([s(null, 'no-mtime')], NOW)
    expect(groups.map((g) => g.label)).toEqual(['Older'])
  })
})
