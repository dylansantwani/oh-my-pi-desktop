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
import { SearchBar } from './components/SearchBar'
import { SettingsPanel } from './components/SettingsPanel'
import { applyTheme, installTheme, prefersDark } from './lib/theme'
import type { AppSettings, MenuCommand } from '../../shared/omp-api'

function focusComposer(): void {
  const ta = document.getElementById('composer-input') as HTMLTextAreaElement | null
  if (ta && !ta.disabled) ta.focus()
}

function runMenuCommand(command: MenuCommand): void {
  const s = useAppStore.getState()
  switch (command) {
    case 'new_session':
      void s.newSession()
      break
    case 'open_project':
      void s.pickProjectAndConnect()
      break
    case 'command_palette':
      void s.setPaletteOpen(!s.paletteOpen)
      break
    case 'focus_composer':
      focusComposer()
      break
    case 'export_html':
      void s.exportHtml()
      break
    case 'toggle_right_panel':
      s.toggleRightPanel()
      break
    case 'find_in_transcript':
      s.setSearchOpen(true)
      break
    case 'settings':
      s.setSettingsOpen(true)
      break
  }
}

export default function App(): React.JSX.Element {
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen)
  const settingsOpen = useAppStore((s) => s.settingsOpen)
  useEffect(() => {
    // Theme lives on the document root, not in React state — the tokens have to
    // be in place before first paint, and every window shares one settings file,
    // so repaint on the broadcast rather than on a local write.
    let current: Pick<AppSettings, 'theme' | 'fontSize'> = { theme: 'system', fontSize: 14 }
    const stopFollowingOs = installTheme(() => current)
    const apply = (s: AppSettings): void => {
      current = s
      applyTheme(s, document.documentElement, prefersDark())
    }
    void window.omp.getSettings().then(apply)
    const off = window.omp.onSettingsChanged(apply)
    return () => {
      off()
      stopFollowingOs()
    }
  }, [])
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
  useEffect(() => window.omp.onMenuCommand(runMenuCommand), [])
  useEffect(() => {
    // Escape is all that is left here. Every chord this handler used to own
    // (Cmd/Ctrl+K/N/O/L) is now declared as an accelerator by the application
    // menu, and on macOS the menu item *and* the page both see the keystroke —
    // so keeping the DOM copies ran each command twice (two new sessions, two
    // project pickers). Rather than dedupe two racing sources, the menu is the
    // single source of truth for anything it binds and the DOM handler keeps
    // only the keys no menu item can claim. A bare Escape is one of them.
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      const s = useAppStore.getState()
      // Search overlays the transcript above the palette; dismiss the topmost
      // surface only, so one Escape never closes two things.
      if (s.searchOpen) {
        s.setSearchOpen(false)
        return
      }
      void s.setPaletteOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div className="app">
      <TopBar />
      {/* Collapsing the right panel has to drop its grid track too, or the chat
          keeps a dead margin. Expressed as a class rather than an inline style
          so the responsive rules in global.css can still win at narrow widths —
          an inline style would beat every media query. */}
      <div className={rightPanelOpen ? 'app-body' : 'app-body is-collapsed'}>
        <Sidebar />
        <main className="chat">
          <SearchBar />
          <Transcript />
          <Composer />
        </main>
        {rightPanelOpen && <RightPanel />}
      </div>
      <StatusBar />
      <UpdateBanner />
      <CommandPalette />
      <SettingsPanel open={settingsOpen} onClose={() => useAppStore.getState().setSettingsOpen(false)} />
      <UiRequestModal />
      <FileViewer />
      <Toasts />
    </div>
  )
}
