import { useLayoutEffect, useRef, useState } from 'react'
import type { AppData, ThemeState } from '../../../shared/types'
import { ThemeManager } from './ThemeManager'
import { PlanningDataSettings } from './PlanningDataSettings'
import { UpdateSettings } from './UpdateSettings'

type SettingsView = 'themes' | 'data' | 'updates'

export function SettingsDialog({
  initialView = 'themes',
  openThemeEditor = false,
  initialTheme,
  busy: appBusy,
  onImported,
  onSaveTheme,
  onClose
}: {
  initialView?: SettingsView
  openThemeEditor?: boolean
  initialTheme?: ThemeState
  busy: boolean
  onImported: (data: AppData) => void
  onSaveTheme: (state: ThemeState) => Promise<boolean>
  onClose: () => void
}): React.JSX.Element {
  const [view, setView] = useState<SettingsView>(initialView)
  const [themeVisible, setThemeVisible] = useState(openThemeEditor)
  const [transferBusy, setTransferBusy] = useState(false)
  const [updateBusy, setUpdateBusy] = useState(false)
  const busy = appBusy || transferBusy || updateBusy
  const dialogRef = useRef<HTMLDialogElement>(null)
  const themeButtonRef = useRef<HTMLButtonElement>(null)

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
        if (!busy && !themeVisible && (event.ctrlKey || event.metaKey) && event.key === ',') {
          event.preventDefault()
          event.stopPropagation()
          setView('themes')
          setThemeVisible(true)
        }
      }}
    >
      <div className="settings-heading">
        <div>
          <h2 id="settings-title">Einstellungen</h2>
          <p>Ansicht und Darstellung deiner Planung.</p>
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
              setThemeVisible(false)
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
              setThemeVisible(false)
            }}
          >
            Updates
          </button>
        </nav>
        <section className="settings-content" aria-live="polite">
          {view === 'updates' ? (
            <UpdateSettings onBusy={setUpdateBusy} />
          ) : view === 'data' ? (
            <PlanningDataSettings onImported={onImported} onBusy={setTransferBusy} />
          ) : (
            <div className="settings-theme-entry">
              <h3>Themes</h3>
              <p>Farben und Vorschau der Jahresansicht bearbeiten.</p>
              <button
                ref={themeButtonRef}
                type="button"
                className="theme-button settings-theme-edit"
                onClick={() => setThemeVisible(true)}
                disabled={busy}
              >
                Themes bearbeiten
              </button>
              {themeVisible && (
                <ThemeManager
                  initial={initialTheme}
                  busy={busy}
                  onSave={onSaveTheme}
                  onClose={() => {
                    setThemeVisible(false)
                    themeButtonRef.current?.focus({ preventScroll: true })
                  }}
                />
              )}
            </div>
          )}
        </section>
      </div>
    </dialog>
  )
}
