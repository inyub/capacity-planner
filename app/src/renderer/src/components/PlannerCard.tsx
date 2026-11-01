import { useId } from 'react'
import type { Card } from '../../../shared/types'
import { formatCardTime } from '../../../shared/time'
import { formatRange } from '../../../shared/totals'

export function PlannerCard({
  card,
  onToggle,
  onEdit,
  disabled
}: {
  card: Card
  onToggle: (id: string) => void
  onEdit: () => void
  disabled: boolean
}): React.JSX.Element {
  const descriptionId = useId()
  const titleId = useId()
  const lines = card.description
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const hasDescription = lines.length > 0

  return (
    <article className="planner-card" data-card-id={card.id} aria-labelledby={titleId}>
      <div className="card-header">
        <span className="card-label">{card.label}</span>
        <button
          className="card-settings"
          type="button"
          disabled={disabled}
          onClick={onEdit}
          aria-label={`${card.title} bearbeiten`}
          title="Karte bearbeiten"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m9.5 3-.6 2.3-1.5.9-2.3-.6-2.5 4.3 1.7 1.7v1.8l-1.7 1.7 2.5 4.3 2.3-.6 1.5.9.6 2.3h5l.6-2.3 1.5-.9 2.3.6 2.5-4.3-1.7-1.7v-1.8l1.7-1.7-2.5-4.3-2.3.6-1.5-.9L14.5 3Zm2.5 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z" />
          </svg>
        </button>
      </div>
      <div className="card-body">
        <div className="card-title-row">
          <h3 className="card-title" id={titleId}>
            {card.title}
          </h3>
          {hasDescription && (
            <button
              className="description-toggle"
              type="button"
              aria-label={`Beschreibung für ${card.title} ${card.expanded ? 'zuklappen' : 'aufklappen'}`}
              aria-expanded={card.expanded}
              aria-controls={descriptionId}
              onClick={() => onToggle(card.id)}
              disabled={disabled}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d={card.expanded ? 'm3 11 5-7 5 7Z' : 'm3 5 5 7 5-7Z'} />
              </svg>
            </button>
          )}
        </div>
        {hasDescription && (
          <div className="card-description" id={descriptionId} hidden={!card.expanded}>
            <span className="description-label">Beschreibung</span>
            <ul>
              {lines.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="card-values">
          <span>{formatCardTime(card.minutesMin, card.minutesMax, card.timeUnit)}</span>
          <span>
            {formatRange(card.revenueMin, card.revenueMax)} {card.currency}
          </span>
        </div>
      </div>
    </article>
  )
}
