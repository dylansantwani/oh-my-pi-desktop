// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsPanel } from '../../src/renderer/src/components/SettingsPanel'

const omp = (): Record<string, ReturnType<typeof vi.fn>> => window.omp as never

describe('SettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing while closed and does not read settings', () => {
    const { container } = render(<SettingsPanel open={false} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
    expect(omp().getSettings).not.toHaveBeenCalled()
  })

  it('loads current settings when opened', async () => {
    render(<SettingsPanel open onClose={() => {}} />)
    await waitFor(() => expect(omp().getSettings).toHaveBeenCalled())
    expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeTruthy()
  })

  it('persists a theme change through the main process', async () => {
    render(<SettingsPanel open onClose={() => {}} />)
    await screen.findByRole('dialog', { name: 'Settings' })
    await userEvent.click(screen.getByRole('button', { name: 'Light' }))
    await waitFor(() => expect(omp().updateSettings).toHaveBeenCalledWith({ theme: 'light' }))
  })

  it('shows the theme that main echoed back, not the one that was clicked', async () => {
    // main sanitizes every write, so the panel must reflect the persisted value.
    omp().updateSettings.mockResolvedValueOnce({
      theme: 'dark',
      fontSize: 14,
      notifyOnTurnEnd: true,
      autoCheckUpdates: true,
      ompPathOverride: null
    })
    render(<SettingsPanel open onClose={() => {}} />)
    await screen.findByRole('dialog', { name: 'Settings' })
    await userEvent.click(screen.getByRole('button', { name: 'Light' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Dark' }).getAttribute('aria-pressed')).toBe('true'))
  })

  it('writes an omp path override on blur and normalizes a blank one to null', async () => {
    render(<SettingsPanel open onClose={() => {}} />)
    await screen.findByRole('dialog', { name: 'Settings' })
    const input = screen.getByPlaceholderText('Auto-detect')
    await userEvent.type(input, '  /opt/omp  ')
    await userEvent.tab()
    await waitFor(() => expect(omp().updateSettings).toHaveBeenCalledWith({ ompPathOverride: '/opt/omp' }))
  })

  it('closes on Escape and on the Done button', async () => {
    const onClose = vi.fn()
    render(<SettingsPanel open onClose={onClose} />)
    await screen.findByRole('dialog', { name: 'Settings' })
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('resets to defaults', async () => {
    render(<SettingsPanel open onClose={() => {}} />)
    await screen.findByRole('dialog', { name: 'Settings' })
    await userEvent.click(screen.getByRole('button', { name: /Reset to defaults/ }))
    await waitFor(() => expect(omp().resetSettings).toHaveBeenCalled())
  })
})
