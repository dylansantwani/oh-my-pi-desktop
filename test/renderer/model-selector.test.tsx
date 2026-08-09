// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useAppStore } from '../../src/renderer/src/store'
import { ModelSelector } from '../../src/renderer/src/components/ModelSelector'

// Shape captured from a real `omp --mode rpc` get_available_models response.
const MODELS = [
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', provider: 'deepseek', contextWindow: 262144 },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', provider: 'deepseek', contextWindow: 262144 },
  { id: 'mimo-v2.5', name: 'MiMo-V2.5', provider: 'xiaomi', contextWindow: 1048576 }
]

describe('ModelSelector', () => {
  const setModel = vi.fn(async () => {})
  const refreshModels = vi.fn(async () => {})

  beforeEach(() => {
    setModel.mockClear()
    refreshModels.mockClear()
    useAppStore.setState({
      status: 'connected',
      models: MODELS,
      model: { provider: 'xiaomi', id: 'mimo-v2.5', name: 'MiMo-V2.5' },
      setModel,
      refreshModels
    })
  })

  it('labels the trigger with the friendly name, not the raw id', () => {
    render(<ModelSelector />)
    expect(screen.getByRole('button', { name: /MiMo-V2\.5/ })).toBeTruthy()
  })

  it('falls back to the id for a model the catalogue does not describe', () => {
    useAppStore.setState({ model: { provider: 'custom', id: 'some-local-build' } })
    render(<ModelSelector />)
    expect(screen.getByRole('button', { name: /some-local-build/ })).toBeTruthy()
  })

  it('groups options by provider and marks the active model selected', () => {
    render(<ModelSelector />)
    fireEvent.click(screen.getByRole('button'))
    const options = screen.getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual([
      expect.stringContaining('DeepSeek V4 Flash'),
      expect.stringContaining('DeepSeek V4 Pro'),
      expect.stringContaining('MiMo-V2.5')
    ])
    expect(options[2].getAttribute('aria-selected')).toBe('true')
    expect(options[0].getAttribute('aria-selected')).toBe('false')
    // Provider headings, so a mixed catalogue does not read as one flat list.
    expect(screen.getByText('deepseek')).toBeTruthy()
    expect(screen.getByText('xiaomi')).toBeTruthy()
  })

  it('shows each model context window so the choice is informed', () => {
    render(<ModelSelector />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('1M')).toBeTruthy()
    expect(screen.getAllByText('262K')).toHaveLength(2)
  })

  it('applies a selection and closes', async () => {
    render(<ModelSelector />)
    fireEvent.click(screen.getByRole('button', { name: /MiMo-V2\.5/ }))
    fireEvent.click(screen.getByRole('option', { name: /DeepSeek V4 Pro/ }))
    await waitFor(() => expect(setModel).toHaveBeenCalledWith('deepseek', 'deepseek-v4-pro'))
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('opens from the keyboard, moves with arrows and commits with Enter', async () => {
    render(<ModelSelector />)
    const trigger = screen.getByRole('button')
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const list = screen.getByRole('listbox')
    fireEvent.keyDown(list, { key: 'Home' })
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    fireEvent.keyDown(list, { key: 'Enter' })
    await waitFor(() => expect(setModel).toHaveBeenCalledWith('deepseek', 'deepseek-v4-pro'))
  })

  it('closes on Escape and hands focus back to the trigger', async () => {
    render(<ModelSelector />)
    const trigger = screen.getByRole('button')
    fireEvent.click(trigger)
    expect(screen.getByRole('listbox')).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    expect(document.activeElement).toBe(trigger)
    expect(setModel).not.toHaveBeenCalled()
  })

  it('is disabled until the agent is connected', () => {
    useAppStore.setState({ status: 'offline' })
    render(<ModelSelector />)
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
  })

  it('says so rather than showing an empty menu when the agent reports no models', () => {
    useAppStore.setState({ models: [] })
    render(<ModelSelector />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText(/No models reported/)).toBeTruthy()
  })
})
