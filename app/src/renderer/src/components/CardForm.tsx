import { useId, useRef, useState } from 'react'
import { inputRange, parseRange, parseTime, timeInput, isTimeUnit } from '../../../shared/time'
import type { Card, Currency } from '../../../shared/types'

export type CardFields = Pick<
  Card,
  | 'label'
  | 'title'
  | 'description'
  | 'minutesMin'
  | 'minutesMax'
  | 'timeUnit'
  | 'revenueMin'
  | 'revenueMax'
  | 'currency'
>

export function CardForm({
  card,
  busy,
  onSave,
  onDelete,
  onCancel
}: {
  card?: Card
  busy: boolean
  onSave: (fields: CardFields) => Promise<boolean>
  onDelete?: () => Promise<boolean>
  onCancel: () => void
}): React.JSX.Element {
  const id = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const submitting = useRef(false)
  const [draft, setDraft] = useState(() => ({
    label: card?.label ?? '',
    title: card?.title ?? '',
    description: card?.description ?? '',
    time: card ? timeInput(card.minutesMin, card.minutesMax, card.timeUnit) : '',
    timeUnit: card?.timeUnit ?? ('h' as const),
    revenue: card ? inputRange(card.revenueMin, card.revenueMax) : '',
    currency: card?.currency ?? ('EUR' as Currency)
  }))
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const time = parseTime(draft.time, draft.timeUnit)
  const revenue = parseRange(draft.revenue)
  const valid = !!draft.label.trim() && !!draft.title.trim() && !!time && !!revenue
  const rangeError = 'Zahl oder Bereich min-max eingeben (min ≤ max).'
  const errors = {
    label: draft.label.trim() ? null : 'Bitte Auftraggeber/Messe eingeben.',
    title: draft.title.trim() ? null : 'Bitte Thema eingeben.',
    time: time ? null : rangeError,
    revenue: revenue ? null : rangeError
  }

  async function save(): Promise<void> {
    if (!valid || !time || !revenue || busy || submitting.current || dialogRef.current?.open) return
    submitting.current = true
    setError(null)
    try {
      const saved = await onSave({
        label: draft.label.trim(),
        title: draft.title.trim(),
        description: draft.description.trim(),
        ...time,
        revenueMin: revenue[0],
        revenueMax: revenue[1],
        currency: draft.currency
      })
      if (saved) onCancel()
      else
        setError(
          'Speichern fehlgeschlagen. Deine Eingaben bleiben erhalten. Bitte erneut versuchen.'
        )
    } finally {
      submitting.current = false
    }
  }

  async function remove(): Promise<void> {
    if (!onDelete || busy || submitting.current) return
    submitting.current = true
    setError(null)
    try {
      if (await onDelete()) onCancel()
      else {
        dialogRef.current?.close()
        setError('Löschen fehlgeschlagen. Bitte erneut versuchen.')
      }
    } finally {
      submitting.current = false
    }
  }

  function textField(
    name: 'label' | 'title' | 'time' | 'revenue',
    label: string
  ): React.JSX.Element {
    const invalid = !!errors[name] && (!!touched[name] || draft[name].length > 0)
    return (
      <div className="form-field">
        <label htmlFor={`${id}-${name}`}>{label}</label>
        <input
          id={`${id}-${name}`}
          name={name}
          value={draft[name]}
          required
          autoFocus={name === 'label'}
          inputMode={name === 'time' || name === 'revenue' ? 'text' : undefined}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-${name}-error` : undefined}
          onChange={(event) => {
            const value = event.target.value
            const parsed = name === 'time' ? parseTime(value, draft.timeUnit) : null
            setDraft({ ...draft, [name]: value, timeUnit: parsed?.timeUnit ?? draft.timeUnit })
          }}
          onBlur={() => setTouched((current) => ({ ...current, [name]: true }))}
        />
        {invalid && (
          <span className="field-error" id={`${id}-${name}-error`}>
            {errors[name]}
          </span>
        )}
      </div>
    )
  }

  return (
    <form
      className="planner-card card-form"
      aria-label={card ? `${card.title} bearbeiten` : 'Neue Karte'}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || dialogRef.current?.open) return
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          if (!busy && !submitting.current) onCancel()
        } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault()
          void save()
        } else if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
          event.preventDefault()
        }
      }}
    >
      <div className="form-heading">
        <span>{card ? 'Karte bearbeiten' : 'Neue Karte'}</span>
        {card && (
          <button
            type="button"
            className="form-close"
            disabled={busy}
            onClick={onCancel}
            aria-label="Bearbeitung abbrechen"
            title="Abbrechen (Esc)"
          >
            ×
          </button>
        )}
      </div>
      <fieldset disabled={busy}>
        {textField('label', 'Auftraggeber/Messe')}
        {textField('title', 'Thema')}
        <div className="form-field">
          <label htmlFor={`${id}-description`}>Beschreibung (optional)</label>
          <textarea
            id={`${id}-description`}
            name="description"
            rows={3}
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
        </div>
        <div className="form-numbers">
          <div className="form-time">
            {textField('time', 'Zeit')}
            <div className="form-field">
              <label htmlFor={`${id}-time-unit`}>Einheit</label>
              <select
                id={`${id}-time-unit`}
                name="timeUnit"
                value={draft.timeUnit}
                disabled={!!draft.time.trim() && !time}
                onChange={(event) => {
                  const unit = event.target.value
                  if (!isTimeUnit(unit)) return
                  setDraft({
                    ...draft,
                    timeUnit: unit,
                    time: time ? timeInput(time.minutesMin, time.minutesMax, unit) : ''
                  })
                }}
              >
                <option value="m">m</option>
                <option value="h">h</option>
                <option value="d">d</option>
              </select>
            </div>
          </div>
          {textField('revenue', '~Umsatz')}
          <div className="form-field">
            <label htmlFor={`${id}-currency`}>Währung</label>
            <select
              id={`${id}-currency`}
              name="currency"
              value={draft.currency}
              onChange={(event) => {
                const currency = event.target.value
                if (currency === 'EUR' || currency === 'CHF') setDraft({ ...draft, currency })
              }}
            >
              <option value="EUR">EUR</option>
              <option value="CHF">CHF</option>
            </select>
          </div>
        </div>
        <p className="form-hint">
          Zeit: z. B. 90m, 1,5h oder 1-2d. 1d = 24h. Auf ganze Minuten gerundet (halbe aufwärts).
        </p>
        <button className="save-card" type="submit" disabled={!valid || busy}>
          {busy ? 'Wird gespeichert…' : 'Speichern'}
        </button>
        {card ? (
          <button
            type="button"
            className="secondary-action delete-card"
            onClick={() => dialogRef.current?.showModal()}
          >
            Löschen
          </button>
        ) : (
          <button type="button" className="secondary-action" onClick={onCancel}>
            Abbrechen
          </button>
        )}
      </fieldset>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {card && (
        <dialog
          ref={dialogRef}
          className="delete-dialog"
          aria-labelledby={`${id}-delete-title`}
          aria-describedby={`${id}-delete-text`}
          onCancel={(event) => {
            if (busy) event.preventDefault()
          }}
        >
          <h2 id={`${id}-delete-title`}>Karte löschen?</h2>
          <p id={`${id}-delete-text`}>„{card.title}“ wird dauerhaft gelöscht.</p>
          <div className="dialog-actions">
            <button
              type="button"
              className="dialog-cancel"
              autoFocus
              disabled={busy}
              onClick={() => dialogRef.current?.close()}
            >
              Abbrechen
            </button>
            <button
              type="button"
              className="confirm-delete"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? 'Wird gelöscht…' : 'Löschen'}
            </button>
          </div>
        </dialog>
      )}
    </form>
  )
}
