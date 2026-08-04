import React, { useEffect } from 'react'
import { useAppStore } from './store'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { Transcript } from './components/Transcript'
import { Composer } from './components/Composer'
import { StatusBar } from './components/StatusBar'
import { RightPanel } from './components/RightPanel'
import { FileViewer } from './components/FileViewer'
import { UiRequestModal } from './components/UiRequestModal'
import { Toasts } from './components/Toasts'
import { UpdateBanner } from './components/UpdateBanner'
import { CommandPalette } from './components/CommandPalette'

export default function App(): React.JSX.Element {
  useEffect(() => {
    void (async () => {
      const remembered = await window.omp.recallProject()
      const target = remembered ?? (await window.omp.defaultProject())
      if (!target) return
      await useAppStore.getState().connect(target)
      if (!remembered) {
        useAppStore
          .getState()
          .toast('Connected to your default workspace — change it anytime from the sidebar footer.', 'info')
      }
    })()
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) {
        if (e.key === 'Escape') void useAppStore.getState().setPaletteOpen(false)
        return
      }
      const key = e.key.toLowerCase()
      if (key === 'k') {
        e.preventDefault()
        void useAppStore.getState().setPaletteOpen(!useAppStore.getState().paletteOpen)
      } else if (key === 'n') {
        e.preventDefault()
        void useAppStore.getState().newSession()
      } else if (key === 'o') {
        e.preventDefault()
        void useAppStore.getState().pickProjectAndConnect()
      } else if (key === 'l') {
        e.preventDefault()
        const ta = document.getElementById('composer-input') as HTMLTextAreaElement | null
        if (ta && !ta.disabled) ta.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div className="app">
      <TopBar />
      <div className="app-body">
        <Sidebar />
        <main className="chat">
          <Transcript />
          <Composer />
        </main>
        <RightPanel />
      </div>
      <StatusBar />
      <UpdateBanner />
      <CommandPalette />
      <UiRequestModal />
      <FileViewer />
      <Toasts />
    </div>
  )
}
