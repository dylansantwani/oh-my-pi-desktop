// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { applyTheme, resolveTheme } from '../src/renderer/src/lib/theme'

describe('resolveTheme', () => {
  it('honours an explicit mode regardless of the OS preference', () => {
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
  })

  it('follows the OS when the mode is system', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
})

describe('applyTheme', () => {
  it('writes the resolved theme, color-scheme, and text scale onto the root', () => {
    const root = document.createElement('html')
    applyTheme({ theme: 'light', fontSize: 17 }, root, true)
    expect(root.dataset.theme).toBe('light')
    expect(root.style.colorScheme).toBe('light')
    expect(root.style.getPropertyValue('--font-size-base')).toBe('17px')
  })

  it('resolves system against the passed OS preference', () => {
    const root = document.createElement('html')
    expect(applyTheme({ theme: 'system', fontSize: 14 }, root, false)).toBe('light')
    expect(root.dataset.theme).toBe('light')
    expect(applyTheme({ theme: 'system', fontSize: 14 }, root, true)).toBe('dark')
    expect(root.dataset.theme).toBe('dark')
  })
})
