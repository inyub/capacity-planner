import { useEffect, useState } from 'react'
import type { UpdateState } from '../../../shared/updates'

export function UpdateSettings({ onBusy }: { onBusy: (busy: boolean) => void }): React.JSX.Element {
  const [state, setState] = useState<UpdateState | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true,
      changed = false
    const unsubscribe = window.capacityPlanner.onUpdateState((value) => {
      changed = true
      if (active) setState(value)
    })
    void window.capacityPlanner
      .getUpdateState()
      .then((value) => {
        if (active && !changed) setState(value)
      })
      .catch(() => {
        if (active) setError('Updatestatus konnte nicht geladen werden.')
      })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])
  const busy = !!state && ['checking', 'downloading', 'installing'].includes(state.status)
  useEffect(() => {
    onBusy(busy)
    return () => onBusy(false)
  }, [busy, onBusy])

  async function run(action: () => Promise<void>, installs = false): Promise<void> {
    setError('')
    if (installs && document.querySelector('.card-form')) {
      setError('Bitte zuerst die offene Karte speichern oder abbrechen.')
      return
    }
    try {
      await action()
    } catch {
      setError('Der Updatevorgang konnte nicht ausgeführt werden. Bitte erneut versuchen.')
    }
  }

  return (
    <div className="update-settings">
      <h3>Updates</h3>
      {state && <p>Version: {state.currentVersion}</p>}
      <p>
        Suche manuell nach einer neuen Version. Deine Planung und Einstellungen bleiben erhalten.
      </p>
      <p role={state?.status === 'error' ? 'alert' : 'status'}>
        {state?.message ?? 'Updatestatus laden …'}
      </p>
      {state?.status === 'downloading' && (
        <div>
          <progress aria-label="Update-Download" value={state.percent ?? 0} max={100} />
          <p>
            {Math.round(state.percent ?? 0)} %
            {state.total
              ? ` · ${((state.transferred ?? 0) / 1048576).toFixed(1)} / ${(state.total / 1048576).toFixed(1)} MB`
              : ''}
          </p>
        </div>
      )}
      <div className="planning-actions">
        <button
          className="theme-button update-check"
          disabled={!state || state.status === 'disabled' || busy || state.status === 'downloaded'}
          onClick={() => void run(window.capacityPlanner.checkForUpdates)}
        >
          Nach Updates suchen
        </button>
        {state?.status === 'available' && (
          <button
            className="theme-button update-download"
            onClick={() => void run(window.capacityPlanner.downloadUpdate, true)}
          >
            Herunterladen und installieren
          </button>
        )}
        {state?.status === 'downloading' && (
          <button
            className="theme-button update-cancel"
            onClick={() => void run(window.capacityPlanner.cancelUpdate)}
          >
            Download abbrechen
          </button>
        )}
        {state?.status === 'downloaded' && (
          <button
            className="theme-button update-install"
            onClick={() => void run(window.capacityPlanner.installUpdate, true)}
          >
            Installation erneut versuchen
          </button>
        )}
      </div>
      {(state?.status === 'available' || state?.status === 'downloaded') && (
        <p>
          Die App wird nach dem vollständigen Download und erfolgreichem Speichern geschlossen,
          aktualisiert und neu gestartet.
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  )
}
