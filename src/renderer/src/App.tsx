import React, { useEffect } from 'react'
import { useAppStore } from './store'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { Transcript } from './components/Transcript'
import { Composer } from './components/Composer'
import { StatusBar } from './components/StatusBar'
import { UiRequestModal } from './components/UiRequestModal'
import { Toasts } from './components/Toasts'
import { Onboarding } from './components/Onboarding'

export default function App(): React.JSX.Element {
  const project = useAppStore((s) => s.project)
  const status = useAppStore((s) => s.status)
  useEffect(() => {
    void (async () => {
      const remembered = await window.omp.recallProject()
      if (remembered) {
        await useAppStore.getState().connect(remembered)
      }
    })()
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
      </div>
      <StatusBar />
      {project === null && status === 'offline' && <Onboarding />}
      <UiRequestModal />
      <Toasts />
    </div>
  )
}
