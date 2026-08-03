import React, { useEffect, useState } from 'react'
import type { UpdateStatus } from '../../../shared/omp-api'

export function UpdateBanner(): React.JSX.Element | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null)

  useEffect(() => window.omp.onUpdateStatus(setStatus), [])

  if (!status) return null
  if (status.state === 'downloaded') {
    return (
      <div className="update-banner">
        <span>Update v{status.version} is ready.</span>
        <button className="btn primary" onClick={() => void window.omp.installUpdate()}>
          Restart to install
        </button>
      </div>
    )
  }
  if (status.state === 'downloading') {
    return (
      <div className="update-banner">
        <span>Downloading update… {status.percent}%</span>
      </div>
    )
  }
  return null
}
