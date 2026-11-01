import { useLayoutEffect, useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Card } from '../../../shared/types'
import { CardForm, type CardFields } from './CardForm'
import { SortableCard } from './SortableCard'
import { formatDuration, formatDurationRange } from '../../../shared/time'
import { formatRange, monthTotals } from '../../../shared/totals'

export function MonthColumn({
  month,
  monthIndex,
  year,
  cards,
  onToggle,
  busy,
  ready,
  onSave,
  onDelete,
  dragging
}: {
  month: string
  monthIndex: number
  year: number
  cards: Card[]
  onToggle: (id: string) => void
  busy: boolean
  ready: boolean
  dragging: boolean
  onSave: (fields: CardFields, card?: Card) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
}): React.JSX.Element {
  const headingId = `month-${monthIndex}`
  const { setNodeRef, isOver } = useDroppable({
    id: `month:${monthIndex}`,
    data: { type: 'month', month: monthIndex }
  })
  const totals = monthTotals(cards)
  const [editor, setEditor] = useState<string | null>(null)
  const columnRef = useRef<HTMLElement>(null)
  const previousEditor = useRef<string | null>(null)
  useLayoutEffect(() => {
    const previous = previousEditor.current
    previousEditor.current = editor
    if (editor !== null || previous === null) return
    const column = columnRef.current
    const target =
      previous === 'new'
        ? column?.querySelector<HTMLButtonElement>('.add-card')
        : Array.from(column?.querySelectorAll<HTMLElement>('[data-card-id]') ?? [])
            .find((element) => element.dataset.cardId === previous)
            ?.querySelector<HTMLButtonElement>('.card-settings')
    const focusTarget = target ?? column?.querySelector<HTMLElement>('.month-cards')
    focusTarget?.focus({
      preventScroll: true
    })
  }, [editor])
  function closeEditor(): void {
    setEditor(null)
  }
  return (
    <section ref={columnRef} className="month-column" aria-labelledby={headingId}>
      <h2 className="month-heading" id={headingId}>
        {month}
      </h2>
      <div
        ref={setNodeRef}
        className={`month-cards${dragging && isOver ? ' is-drop-target' : ''}`}
        data-month={monthIndex}
        role="region"
        aria-label={`Einträge für ${month} ${year}`}
        tabIndex={0}
      >
        <SortableContext
          items={cards.map((card) => card.id)}
          strategy={verticalListSortingStrategy}
        >
          {cards.map((card) =>
            editor === card.id ? (
              <CardForm
                key={card.id}
                card={card}
                busy={busy || dragging}
                onCancel={closeEditor}
                onSave={(fields) => onSave(fields, card)}
                onDelete={() => onDelete(card.id)}
              />
            ) : (
              <SortableCard
                key={card.id}
                card={card}
                onToggle={onToggle}
                disabled={busy || dragging || editor !== null}
                dragDisabled={busy || editor !== null}
                onEdit={() => setEditor(card.id)}
              />
            )
          )}
        </SortableContext>
        {editor === 'new' && (
          <CardForm
            busy={busy || dragging}
            onSave={(fields) => onSave(fields)}
            onCancel={closeEditor}
          />
        )}
        {editor === null && (
          <button
            className="add-card"
            type="button"
            disabled={!ready || busy || dragging}
            onClick={() => setEditor('new')}
            aria-label={`Karte für ${month} ${year} hinzufügen`}
            title="Karte hinzufügen"
          >
            <span aria-hidden="true">+</span>
          </button>
        )}
      </div>
      <footer className="month-footer" aria-label={`Gesamt für ${month} ${year}`}>
        <span className="total-label">Gesamt</span>
        <div className="month-totals">
          <span
            className="total-time"
            aria-label={cards.length ? 'Zeit gesamt' : 'Keine Zeit'}
            title={cards.length ? formatDurationRange(...totals.minutes) : undefined}
          >
            {cards.length ? (
              <>
                <span>{formatDuration(totals.minutes[0])}</span>
                {totals.minutes[0] !== totals.minutes[1] && (
                  <span>
                    {' – '}
                    {formatDuration(totals.minutes[1])}
                  </span>
                )}
              </>
            ) : (
              '–'
            )}
          </span>
          <div className="month-revenue" aria-label="Umsatz gesamt">
            {cards.length === 0 ? (
              <span>–</span>
            ) : (
              (['CHF', 'EUR'] as const).map((currency) => {
                const range = totals.revenue[currency]
                return range ? (
                  <span key={currency}>
                    {formatRange(...range)} {currency}
                  </span>
                ) : null
              })
            )}
          </div>
        </div>
      </footer>
    </section>
  )
}
