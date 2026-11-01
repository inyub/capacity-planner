import { useLayoutEffect, useRef, useState } from 'react'
import type { ThemeColors, ThemeState } from '../../../shared/types'
import {
  activeTheme,
  COLOR_FIELDS,
  defaultThemeState,
  DEFAULT_THEMES,
  isHexColor,
  isThemeState
} from '../../../shared/themes'
import { applyTheme } from '../applyTheme'

export function ThemeManager({
  hidden,
  initial,
  busy,
  onSave
}: {
  hidden: boolean
  initial?: ThemeState
  busy: boolean
  onSave: (state: ThemeState) => Promise<boolean>
}): React.JSX.Element {
  const [draft, setDraft] = useState<ThemeState>(() =>
    structuredClone(initial ?? defaultThemeState())
  )
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<ThemeState>(() =>
    structuredClone(initial ?? defaultThemeState())
  )
  const [justSaved, setJustSaved] = useState(false)
  const deleteRef = useRef<HTMLDialogElement>(null)
  const submittingRef = useRef(false)
  const originalRef = useRef(activeTheme(initial).colors)
  const theme = activeTheme(draft)
  const valid = isThemeState(draft)
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  useLayoutEffect(() => {
    applyTheme(theme.colors)
    const original = originalRef.current
    return () => applyTheme(original)
  }, [theme.colors])

  function discard(): void {
    if (busy || submittingRef.current) return
    setDraft(structuredClone(saved))
    setError(null)
    setJustSaved(false)
  }
  function updateTheme(change: Partial<typeof theme>): void {
    setDraft((current) => ({
      ...current,
      themes: current.themes.map((item) =>
        item.id === current.activeId ? { ...item, ...change } : item
      )
    }))
    setError(null)
    setJustSaved(false)
  }
  function color(key: keyof ThemeColors, value: string): void {
    updateTheme({ colors: { ...theme.colors, [key]: value } })
  }
  async function save(): Promise<void> {
    if (!valid || busy || submittingRef.current || deleteRef.current?.open) return
    submittingRef.current = true
    setError(null)
    try {
      const state = {
        ...draft,
        themes: draft.themes.map((item) => ({ ...item, name: item.name.trim() }))
      }
      if (await onSave(state)) {
        originalRef.current = activeTheme(state).colors
        setSaved(structuredClone(state))
        setDraft(structuredClone(state))
        setJustSaved(true)
      } else
        setError(
          'Das Theme konnte nicht gespeichert werden. Deine Änderungen bleiben hier erhalten.'
        )
    } finally {
      submittingRef.current = false
    }
  }
  function duplicate(): void {
    const copy = {
      ...theme,
      id: crypto.randomUUID(),
      name: `${theme.name.trim().slice(0, 57)} Kopie`,
      colors: { ...theme.colors }
    }
    setDraft((current) => ({ activeId: copy.id, themes: [...current.themes, copy] }))
    setError(null)
    setJustSaved(false)
  }
  function remove(): void {
    const themes = draft.themes.filter((item) => item.id !== theme.id)
    if (!themes.length) return
    deleteRef.current?.close()
    setDraft({ activeId: themes[0].id, themes })
    setError(null)
    setJustSaved(false)
  }
  return (
    <div
      className="theme-manager"
      hidden={hidden}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || deleteRef.current?.open) return
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault()
          void save()
        }
      }}
    >
      <div className="theme-picker">
        <label className="theme-select-label" htmlFor="theme-select">
          Theme
        </label>
        <span className="theme-swatches" aria-hidden="true">
          {[theme.colors.header, theme.colors.card, theme.colors.accent].map((value, index) => (
            <i key={index} style={{ background: isHexColor(value) ? value : undefined }} />
          ))}
        </span>
        <select
          id="theme-select"
          className="theme-select"
          value={draft.activeId}
          disabled={busy}
          onChange={(event) => {
            const activeId = event.target.value
            setDraft((current) => ({ ...current, activeId }))
            setError(null)
            setJustSaved(false)
          }}
        >
          {draft.themes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name || 'Unbenannt'}
            </option>
          ))}
        </select>
        <button
          className="theme-duplicate theme-button"
          type="button"
          onClick={duplicate}
          disabled={
            busy ||
            draft.themes.length >= 64 ||
            !isThemeState({ activeId: theme.id, themes: [theme] })
          }
        >
          + Duplizieren
        </button>
      </div>
      <section className="theme-editor" aria-label="Theme bearbeiten">
        <fieldset disabled={busy}>
          <div className="theme-name-row">
            <label className="theme-name">
              Name
              <input
                name="theme-name"
                maxLength={64}
                value={theme.name}
                aria-invalid={!theme.name.trim()}
                onChange={(event) => updateTheme({ name: event.target.value })}
              />
            </label>
            <button
              className="theme-button theme-reset"
              type="button"
              onClick={() =>
                updateTheme({
                  colors: { ...DEFAULT_THEMES.find((item) => item.id === theme.baseId)!.colors }
                })
              }
            >
              Zurücksetzen
            </button>
            <button
              className="theme-button theme-delete"
              type="button"
              onClick={() => deleteRef.current?.showModal()}
              disabled={draft.themes.length === 1}
              title={
                draft.themes.length === 1
                  ? 'Mindestens ein Theme bleibt erhalten.'
                  : 'Theme löschen'
              }
            >
              Löschen
            </button>
          </div>
          <div className="theme-preview" aria-label="Farbvorschau">
            <span className="theme-preview-label">Vorschau</span>
            <div className="planner-card">
              <div className="card-header">
                <span className="card-label">Auftraggeber / Messe</span>
                <span aria-hidden="true">✦</span>
              </div>
              <div className="card-body">
                <div className="card-title-row">
                  <h3 className="card-title">Buchsatz</h3>
                </div>
                <div className="card-values">
                  <span>10–15 h</span>
                  <span>150–300 EUR</span>
                </div>
              </div>
            </div>
            <p>Die Jahresansicht zeigt deine Änderungen live.</p>
          </div>
          <h3 className="theme-colors-title">Farben</h3>
          <div className="theme-colors">
            {COLOR_FIELDS.map(({ key, label }) => (
              <div className="theme-color" key={key}>
                <label htmlFor={`color-${key}`}>{label}</label>
                <div>
                  <input
                    type="color"
                    value={isHexColor(theme.colors[key]) ? theme.colors[key] : '#000000'}
                    onChange={(event) => color(key, event.target.value)}
                    aria-label={`${label} auswählen`}
                  />
                  <input
                    id={`color-${key}`}
                    name={`color-${key}`}
                    value={theme.colors[key]}
                    maxLength={7}
                    spellCheck={false}
                    autoComplete="off"
                    aria-invalid={!isHexColor(theme.colors[key])}
                    aria-describedby={
                      !isHexColor(theme.colors[key]) ? 'theme-color-error' : undefined
                    }
                    onChange={(event) => color(key, event.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
          {!valid && (
            <p className="form-error" id="theme-color-error">
              Bitte einen Namen und Farben im Format #RRGGBB eingeben.
            </p>
          )}
        </fieldset>
      </section>
      <div className="theme-actions">
        <div>
          <p className={justSaved ? 'theme-saved' : undefined}>
            {justSaved ? 'Theme gespeichert.' : 'Änderungen werden mit Speichern übernommen.'}
          </p>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </div>
        <button
          type="button"
          className="theme-button theme-discard"
          onClick={discard}
          disabled={busy || !dirty}
        >
          Verwerfen
        </button>
        <button
          type="button"
          className="theme-button theme-save"
          onClick={() => void save()}
          disabled={busy || !valid}
        >
          {busy ? 'Wird gespeichert…' : 'Speichern'}
        </button>
      </div>
      <dialog
        ref={deleteRef}
        className="delete-dialog theme-delete-dialog"
        onCancel={(event) => event.stopPropagation()}
        aria-labelledby="theme-delete-title"
        aria-describedby="theme-delete-text"
      >
        <h2 id="theme-delete-title">Theme löschen?</h2>
        <p id="theme-delete-text">
          „{theme.name}“ wird aus deiner Auswahl entfernt. Mit Speichern wird die Änderung
          übernommen.
        </p>
        <div className="dialog-actions">
          <button type="button" autoFocus onClick={() => deleteRef.current?.close()}>
            Abbrechen
          </button>
          <button type="button" className="confirm-delete" onClick={remove}>
            Theme löschen
          </button>
        </div>
      </dialog>
    </div>
  )
}
