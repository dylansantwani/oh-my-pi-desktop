// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { useAppStore } from '../../src/renderer/src/store'
import { FileViewer } from '../../src/renderer/src/components/FileViewer'

describe('FileViewer', () => {
  beforeEach(() => {
    useAppStore.setState({ openFilePath: null })
    vi.mocked(window.omp.readFile).mockClear()
  })

  it('renders nothing when no file is open', () => {
    const { container } = render(<FileViewer />)
    expect(container.firstChild).toBeNull()
  })

  it('shows file content on a successful read', async () => {
    vi.mocked(window.omp.readFile).mockResolvedValueOnce({ ok: true, content: 'const x = 1', size: 12 })
    useAppStore.setState({ openFilePath: 'C:\\proj\\a.ts' })
    render(<FileViewer />)
    await screen.findByText('a.ts')
    await waitFor(() => expect(document.querySelector('.file-code')?.textContent).toContain('const x = 1'))
    expect(window.omp.readFile).toHaveBeenCalledWith('C:\\proj\\a.ts')
  })

  it('renders the error string on a failed read', async () => {
    vi.mocked(window.omp.readFile).mockResolvedValueOnce({ ok: false, error: 'file not found' })
    useAppStore.setState({ openFilePath: 'C:\\proj\\nope.ts' })
    render(<FileViewer />)
    await screen.findByText(/file not found/)
  })

  it('closes when the overlay is clicked', async () => {
    vi.mocked(window.omp.readFile).mockResolvedValueOnce({ ok: true, content: 'x', size: 1 })
    useAppStore.setState({ openFilePath: 'C:\\proj\\a.ts' })
    render(<FileViewer />)
    await screen.findByText('a.ts')
    fireOverlayClick()
    expect(useAppStore.getState().openFilePath).toBeNull()
  })
})

function fireOverlayClick(): void {
  const overlay = document.querySelector('.file-viewer-overlay')
  expect(overlay).toBeTruthy()
  overlay!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}
