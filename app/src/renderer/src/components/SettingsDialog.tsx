import { useLayoutEffect, useRef, useState } from 'react'
import type { AppData, ThemeState } from '../../../shared/types'
import { ThemeManager } from './ThemeManager'
import { PlanningDataSettings } from './PlanningDataSettings'
import { UpdateSettings } from './UpdateSettings'

type SettingsView = 'themes' | 'data' | 'updates' | 'view'

export function SettingsDialog({
  initialView = 'themes',
  initialTheme,
  busy: appBusy,
  weekGrouping,
  onWeekGroupingChange,
  onImported,
  onSaveTheme,
  onClose
}: {
  initialView?: SettingsView
  initialTheme?: ThemeState
  busy: boolean
  weekGrouping: boolean
  onWeekGroupingChange: (enabled: boolean) => void
  onImported: (data: AppData) => void
  onSaveTheme: (state: ThemeState) => Promise<boolean>
  onClose: () => void
}): React.JSX.Element {
  const [view, setView] = useState<SettingsView>(initialView)
  const [transferBusy, setTransferBusy] = useState(false)
  const [updateBusy, setUpdateBusy] = useState(false)
  const busy = appBusy || transferBusy || updateBusy
  const dialogRef = useRef<HTMLDialogElement>(null)

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const previous = document.activeElement as HTMLElement | null
    dialog?.showModal()
    return () => {
      dialog?.close()
      const target =
        previous?.isConnected && previous !== document.body && !previous.matches(':disabled')
          ? previous
          : document.querySelector<HTMLElement>('.settings-open')
      target?.focus({ preventScroll: true })
    }
  }, [])

  function close(): void {
    if (busy) return
    dialogRef.current?.close()
    onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="settings-dialog"
      aria-labelledby="settings-title"
      onCancel={(event) => {
        event.preventDefault()
        event.stopPropagation()
        close()
      }}
      onKeyDown={(event) => {
        if (!busy && (event.ctrlKey || event.metaKey) && event.key === ',') {
          event.preventDefault()
          event.stopPropagation()
          setView('themes')
        }
      }}
    >
      <div className="settings-heading">
        <div>
          <h2 id="settings-title">Einstellungen</h2>
          <p>Themes, Daten, Updates und Ansicht deiner Planung.</p>
        </div>
        <button
          className="theme-close settings-close"
          type="button"
          onClick={close}
          disabled={busy}
        >
          ×<span className="sr-only">Einstellungen schließen</span>
        </button>
      </div>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Einstellungsbereiche">
          <button
            type="button"
            className="settings-nav-item"
            aria-current={view === 'themes' ? 'page' : undefined}
            onClick={() => {
              setView('themes')
            }}
            disabled={busy}
          >
            Themes
          </button>
          <button
            type="button"
            className="settings-nav-item"
            aria-current={view === 'data' ? 'page' : undefined}
            onClick={() => {
              setView('data')
            }}
            disabled={busy}
          >
            Daten / Import &amp; Export
          </button>
          <button
            type="button"
            className="settings-nav-item"
            aria-current={view === 'updates' ? 'page' : undefined}
            disabled={busy}
            onClick={() => {
              setView('updates')
            }}
          >
            Updates
          </button>
          <button
            type="button"
            className="settings-nav-item"
            aria-current={view === 'view' ? 'page' : undefined}
            disabled={busy}
            onClick={() => {
              setView('view')
            }}
          >
            Ansicht
          </button>
        </nav>
        <section className="settings-content" aria-live="polite">
          <ThemeManager
            hidden={view !== 'themes'}
            initial={initialTheme}
            busy={busy}
            onSave={onSaveTheme}
          />
          {view === 'updates' && <UpdateSettings onBusy={setUpdateBusy} />}
          {view === 'view' && (
            <div className="view-settings">
              <h3>Ansicht</h3>
              <label className="settings-check">
                <input
                  type="checkbox"
                  name="weekGrouping"
                  checked={weekGrouping}
                  onChange={(event) => onWeekGroupingChange(event.target.checked)}
                />
                Karten nach Kalenderwochen gruppieren
              </label>
              <p className="settings-note">
                Jeder Monat zeigt seine Kalenderwochen (z. B. „KW 45“) mit Wochensumme. Karten
                lassen sich zwischen Wochen ziehen. Beim Ausschalten bleibt die Zuordnung erhalten.
              </p>
            </div>
          )}
          {view === 'data' && (
            <PlanningDataSettings onImported={onImported} onBusy={setTransferBusy} />
          )}
        </section>
      </div>
    </dialog>
  )
}
