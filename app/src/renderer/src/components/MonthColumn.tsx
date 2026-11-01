import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Card } from '../../../shared/types'
import { CardForm, type CardFields } from './CardForm'
import { SortableCard } from './SortableCard'
import { WeekGroup } from './WeekGroup'
import { groupByWeek, monthWeeks } from '../../../shared/weeks'
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
  onScrollTop,
  dragging,
  weekGrouping
}: {
  month: string
  monthIndex: number
  year: number
  cards: Card[]
  onToggle: (id: string) => void
  busy: boolean
  ready: boolean
  dragging: boolean
  weekGrouping: boolean
  onSave: (fields: CardFields, card?: Card, week?: number) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
  onScrollTop: (top: number) => void
}): React.JSX.Element {
  const headingId = `month-${monthIndex}`
  const { setNodeRef, isOver } = useDroppable({
    id: `month:${monthIndex}`,
    data: { type: 'month', month: monthIndex }
  })
  const totals = monthTotals(cards)
  // null, a card id, 'new' (ungrouped "+") or 'new:<week>' (the "+" of a calendar week).
  const [editor, setEditor] = useState<string | null>(null)
  const weeks = useMemo(() => monthWeeks(year, monthIndex), [year, monthIndex])
  const groups = weekGrouping ? groupByWeek(cards, weeks) : null
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
        : previous.startsWith('new:')
          ? column?.querySelector<HTMLButtonElement>(
              `.week-group[data-week="${previous.slice(4)}"] .add-card`
            )
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
  function cardOrForm(card: Card, week?: number | null): React.JSX.Element {
    return editor === card.id ? (
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
        week={week}
        onToggle={onToggle}
        disabled={busy || dragging || editor !== null}
        dragDisabled={busy || editor !== null}
        onEdit={() => setEditor(card.id)}
      />
    )
  }
  function addButton(target: string, week?: string): React.JSX.Element {
    return (
      <button
        className="add-card"
        type="button"
        disabled={!ready || busy || dragging}
        onClick={() => setEditor(target)}
        aria-label={`Karte für ${week ? `${week}, ` : ''}${month} ${year} hinzufügen`}
        title="Karte hinzufügen"
      >
        <span aria-hidden="true">+</span>
      </button>
    )
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
        onScroll={(event) => onScrollTop(event.currentTarget.scrollTop)}
      >
        {groups ? (
          groups.map((group) =>
            group.week === null && group.cards.length === 0 && !dragging ? null : (
              <WeekGroup
                key={group.week ?? 'none'}
                monthIndex={monthIndex}
                week={weeks.find((entry) => entry.week === group.week) ?? null}
                cards={group.cards}
                dragging={dragging}
              >
                {/* One sortable list per week, so a move between weeks never shifts other weeks. */}
                <SortableContext
                  items={group.cards.map((card) => card.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {group.cards.map((card) => cardOrForm(card, group.week))}
                </SortableContext>
                {group.week !== null && editor === `new:${group.week}` && (
                  <CardForm
                    busy={busy || dragging}
                    onSave={(fields) => onSave(fields, undefined, group.week ?? undefined)}
                    onCancel={closeEditor}
                  />
                )}
                {group.week !== null &&
                  editor === null &&
                  addButton(`new:${group.week}`, `KW ${group.week}`)}
              </WeekGroup>
            )
          )
        ) : (
          <SortableContext
            items={cards.map((card) => card.id)}
            strategy={verticalListSortingStrategy}
          >
            {cards.map((card) => cardOrForm(card))}
          </SortableContext>
        )}
        {!groups && editor === 'new' && (
          <CardForm
            busy={busy || dragging}
            onSave={(fields) => onSave(fields)}
            onCancel={closeEditor}
          />
        )}
        {!groups && editor === null && addButton('new')}
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
