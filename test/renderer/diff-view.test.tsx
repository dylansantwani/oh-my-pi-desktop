// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DiffView } from '../../src/renderer/src/components/DiffView'
import { ToolCallCard } from '../../src/renderer/src/components/ToolCallCard'
import { diffLines } from '../../src/renderer/src/lib/diff'
import type { ToolCallView } from '../../src/renderer/src/lib/transcript'

function gutters(row: Element): string[] {
  return [...row.querySelectorAll('.diff-ln')].map((n) => n.textContent ?? '')
}

function rowsOf(kind: string): Element[] {
  return [...document.querySelectorAll(`.diff-row.${kind}`)]
}

describe('DiffView', () => {
  it('renders each row with its old and new line numbers', () => {
    const { hunks } = diffLines('a\nb\nc\nd', 'a\nx\nc\nd')
    render(<DiffView path={'C:\\proj\\a.ts'} hunks={hunks} />)

    expect(document.querySelectorAll('.diff-row')).toHaveLength(5)
    const del = rowsOf('del')
    expect(del).toHaveLength(1)
    expect(del[0].querySelector('.diff-text')?.textContent).toBe('b')
    expect(gutters(del[0])).toEqual(['2', ''])

    const add = rowsOf('add')
    expect(add).toHaveLength(1)
    expect(add[0].querySelector('.diff-text')?.textContent).toBe('x')
    expect(gutters(add[0])).toEqual(['', '2'])

    const ctx = rowsOf('ctx')
    expect(ctx).toHaveLength(3)
    expect(gutters(ctx[0])).toEqual(['1', '1'])
    expect(gutters(ctx[1])).toEqual(['3', '3'])
    expect(screen.getByTitle('C:\\proj\\a.ts')).toBeTruthy()
  })

  it('shows the +N / −M stat pill', () => {
    const { hunks } = diffLines('a\nb\nc', 'a\nx\ny\nz\nc')
    render(<DiffView path="a.ts" hunks={hunks} />)
    expect(screen.getByText('+3')).toBeTruthy()
    expect(screen.getByText('−1')).toBeTruthy()
  })

  it('warns when the diff was degraded by the size guard', () => {
    const { hunks } = diffLines('a', 'b')
    render(<DiffView path="a.ts" hunks={hunks} degraded />)
    expect(screen.getByText(/showing the whole block as a replace/i)).toBeTruthy()
  })

  it('separates hunks with an @@ marker only when there is more than one', () => {
    const base = Array.from({ length: 30 }, (_, i) => `l${i + 1}`).join('\n')
    const one = diffLines(base, base.replace('l5\n', 'X\n'))
    render(<DiffView path="a.ts" hunks={one.hunks} />)
    expect(document.querySelectorAll('.diff-sep')).toHaveLength(0)

    const two = diffLines(base, base.replace('l5\n', 'X\n').replace('l25\n', 'Y\n'))
    const { container } = render(<DiffView path="b.ts" hunks={two.hunks} />)
    const seps = [...container.querySelectorAll('.diff-sep')]
    expect(seps).toHaveLength(2)
    expect(seps[0].textContent).toBe('@@ -2,7 +2,7 @@')
  })

  it('collapses a large diff and expands it from the toggle', () => {
    const big = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join('\n')
    const { hunks } = diffLines('', big)
    render(<DiffView path="a.ts" hunks={hunks} />)

    expect(document.querySelectorAll('.diff-row')).toHaveLength(18)
    const toggle = screen.getByRole('button', { name: 'Show all 60 lines' })

    fireEvent.click(toggle)
    expect(document.querySelectorAll('.diff-row')).toHaveLength(60)

    fireEvent.click(screen.getByRole('button', { name: 'Show less' }))
    expect(document.querySelectorAll('.diff-row')).toHaveLength(18)
  })

  it('does not collapse a diff that fits', () => {
    const { hunks } = diffLines('a\nb\nc\nd', 'a\nx\nc\nd')
    render(<DiffView path="a.ts" hunks={hunks} />)
    expect(screen.queryByText(/show all/i)).toBeNull()
  })
})

function card(name: string, args: unknown): ToolCallView {
  return { id: 't1', name, args, status: 'ok' }
}

describe('ToolCallCard diff rendering', () => {
  it('shows the stat pill while collapsed and the diff once expanded', () => {
    render(<ToolCallCard tool={card('edit', { file_path: 'C:\\proj\\a.ts', old_string: 'a\nb\nc', new_string: 'a\nx\nc' })} />)
    expect(screen.getByText('+1')).toBeTruthy()
    expect(screen.getByText('−1')).toBeTruthy()
    expect(document.querySelectorAll('.diff-row')).toHaveLength(0)

    fireEvent.click(document.querySelector('.tool-card-head')!)
    expect(rowsOf('del')[0].querySelector('.diff-text')?.textContent).toBe('b')
    expect(document.querySelector('.tool-card-body pre')).toBeNull()
  })

  it('keeps the raw-JSON body for tools it cannot diff', () => {
    render(<ToolCallCard tool={card('bash', { command: 'ls -la' })} />)
    expect(document.querySelector('.diff-stat')).toBeNull()
    fireEvent.click(document.querySelector('.tool-card-head')!)
    expect(document.querySelector('.tool-card-body pre')?.textContent).toContain('ls -la')
    expect(document.querySelector('.diff')).toBeNull()
  })

  it('falls back to JSON when an edit changed nothing', () => {
    render(<ToolCallCard tool={card('edit', { path: 'a.ts', old_string: 'same', new_string: 'same' })} />)
    expect(document.querySelector('.diff-stat')).toBeNull()
    fireEvent.click(document.querySelector('.tool-card-head')!)
    expect(document.querySelector('.tool-card-body pre')?.textContent).toContain('old_string')
  })

  it('renders a write as an all-adds diff', () => {
    render(<ToolCallCard tool={card('write', { file_path: 'a.ts', content: 'one\ntwo\n' })} />)
    expect(screen.getByText('+2')).toBeTruthy()
    fireEvent.click(document.querySelector('.tool-card-head')!)
    expect(rowsOf('add')).toHaveLength(2)
    expect(rowsOf('del')).toHaveLength(0)
  })
})
