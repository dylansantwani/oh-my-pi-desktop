import React from 'react'
import { useAppStore } from '../store'
import { FolderOpen } from 'lucide-react'

export function Onboarding(): React.JSX.Element {
  const pickProjectAndConnect = useAppStore((s) => s.pickProjectAndConnect)
  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <div className="brand-mark" aria-hidden="true">π</div>
        <h2>Welcome to Oh My Pi Desktop</h2>
        <p>Choose a project directory. The app runs the Oh My Pi coding agent there and shows its work here.</p>
        <button className="btn primary" onClick={() => void pickProjectAndConnect()}>
          <FolderOpen size={16} /> Choose project…
        </button>
        <div className="onboarding-hints">
          <span>Streaming chat</span>
          <span>Tool-call cards</span>
          <span>Sessions</span>
          <span>Automatic updates</span>
        </div>
      </div>
    </div>
  )
}
