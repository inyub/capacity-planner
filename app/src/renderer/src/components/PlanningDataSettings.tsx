import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AppData, PlanningPreview } from '../../../shared/types'

export function PlanningDataSettings({
  onImported,
  onBusy
}: {
  onImported: (data: AppData) => void
  onBusy: (busy: boolean) => void
}): React.JSX.Element {
  const [preview, setPreview] = useState<PlanningPreview | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const cancelRef = useRef<HTMLButtonElement>(null)
  const importRef = useRef<HTMLButtonElement>(null)

  useEffect(
    () => () => {
      void window.capacityPlanner.cancelPlanning().catch(() => {})
    },
    []
  )
  useLayoutEffect(() => {
    if (busy) return
    if (preview) cancelRef.current?.focus()
    else importRef.current?.focus()
  }, [preview, busy])

  function cancel(): void {
    if (busyRef.current) return
    void window.capacityPlanner.cancelPlanning().catch(() => {})
    setPreview(null)
    setConfirmed(false)
    setMessage('Import abgebrochen. Die Planung bleibt unverändert.')
    importRef.current?.focus()
  }

  async function run(action: () => Promise<void>): Promise<void> {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    onBusy(true)
    setError('')
    setMessage('')
    try {
      await action()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Der Vorgang ist fehlgeschlagen.')
    } finally {
      busyRef.current = false
      setBusy(false)
      onBusy(false)
    }
  }

  return (
    <div
      className="planning-data"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && preview) {
          event.preventDefault()
          event.stopPropagation()
          cancel()
        }
      }}
    >
      <h3>Planungsdaten aller Jahre</h3>
      <p>
        Sichere Karten als JSON-Datei oder stelle sie aus einer Exportdatei wieder her. Themes,
        Fensterdaten und Ansichtseinstellungen sind nicht enthalten.
      </p>
      {!preview && (
        <div className="planning-actions">
          <button
            className="theme-button planning-export"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const saved = await window.capacityPlanner.exportPlanning()
                setMessage(saved ? 'Planungsdaten aller Jahre exportiert.' : 'Export abgebrochen.')
              })
            }
          >
            Exportieren …
          </button>
          <button
            ref={importRef}
            className="theme-button planning-import"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await window.capacityPlanner.previewPlanning()
                setConfirmed(false)
                setPreview(result)
                if (!result) setMessage('Import abgebrochen. Die Planung bleibt unverändert.')
              })
            }
          >
            Importieren …
          </button>
        </div>
      )}
      {preview && (
        <section className="planning-preview" aria-labelledby="planning-preview-title">
          <h4 id="planning-preview-title">Importvorschau</h4>
          <p>
            Datei: <strong>{preview.fileName}</strong>
          </p>
          <p>
            {preview.cardCount} Karten aus {preview.years.length} Jahren:
          </p>
          <ul>
            {preview.years.map(({ year, count }) => (
              <li key={year}>
                {year}: {count} Karten
              </li>
            ))}
          </ul>
          {preview.cardCount === 0 && (
            <p>Die Datei ist leer. Beim Ersetzen werden alle vorhandenen Karten entfernt.</p>
          )}
          {preview.dataVersion === 1 && (
            <p>Alte Stundenwerte werden in Minuten umgerechnet; 1 Tag entspricht 1440 Minuten.</p>
          )}
          <p>
            Ersetzt werden alle {preview.existingCardCount} vorhandenen Karten
            {preview.existingYears.length > 0
              ? ` der Jahre ${preview.existingYears.join(', ')}`
              : ''}
            . Der bisherige Stand wird vor der Übernahme als data.backup.json gesichert.
          </p>
          <label className="planning-confirm-label">
            <input
              type="checkbox"
              className="planning-confirm-check"
              checked={confirmed}
              disabled={busy}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            Ich möchte die gesamte vorhandene Planung durch diese Datei ersetzen.
          </label>
          <div className="planning-actions">
            <button
              ref={cancelRef}
              className="theme-button planning-cancel"
              disabled={busy}
              onClick={cancel}
            >
              Abbrechen
            </button>
            <button
              className="theme-button planning-confirm"
              disabled={busy || !confirmed}
              onClick={() =>
                void run(async () => {
                  try {
                    const data = await window.capacityPlanner.confirmPlanning(preview.token)
                    onImported(data)
                    setMessage('Planung ersetzt. Der vorherige Stand wurde gesichert.')
                  } finally {
                    setPreview(null)
                    setConfirmed(false)
                    importRef.current?.focus()
                  }
                })
              }
            >
              Planung sichern und ersetzen
            </button>
          </div>
        </section>
      )}
      {busy && <p role="status">Bitte warten …</p>}
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  )
}
