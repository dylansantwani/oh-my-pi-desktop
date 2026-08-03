// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act } from '@testing-library/react'
import { useAppStore } from '../../src/renderer/src/store'

// The store attaches its onUiRequest handler once at module load (store.ts
// module wiring), so the setup stub's first call captured it.
const onUiMock = window.omp.onUiRequest as unknown as { mock: { calls: Array<Array<(req: Record<string, unknown>) => void>> } }
const uiHandler = onUiMock.mock.calls[0][0]

describe('ui_request filtering', () => {
  it('absorbs non-dialog methods like setWidget so no stray modal can pop', () => {
    act(() => {
      uiHandler({ type: 'extension_ui_request', method: 'setWidget', widgetKey: 'autoresearch', id: 'w1' })
    })
    expect(useAppStore.getState().uiRequest).toBeNull()
  })

  it('passes dialog methods through to the modal', () => {
    act(() => {
      uiHandler({ type: 'extension_ui_request', method: 'notify', id: 'n1', title: 'done', message: 'ok' })
    })
    expect(useAppStore.getState().uiRequest).toMatchObject({ method: 'notify' })
    act(() => {
      useAppStore.setState({ uiRequest: null })
    })
  })

  it('passes requests without a method field through (protocol back-compat)', () => {
    act(() => {
      uiHandler({ type: 'extension_ui_request', id: 'n2', title: 'hi' })
    })
    expect(useAppStore.getState().uiRequest).not.toBeNull()
    act(() => {
      useAppStore.setState({ uiRequest: null })
    })
  })
})
