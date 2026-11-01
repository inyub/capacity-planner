import type { ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import type { Card } from '../../../shared/types'
import { formatWeekDates, type MonthWeek } from '../../../shared/weeks'
import { formatDurationRange } from '../../../shared/time'
import { formatRange, monthTotals } from '../../../shared/totals'

export function WeekGroup({
  monthIndex,
  week,
  cards,
  dragging,
  children
}: {
  monthIndex: number
  /** null is the "Ohne KW" group for cards without a week of this month. */
  week: MonthWeek | null
  cards: Card[]
  dragging: boolean
  children: ReactNode
}): React.JSX.Element {
  const key = week?.week ?? null
  const { setNodeRef, isOver } = useDroppable({
    id: `week:${monthIndex}:${key ?? 'none'}`,
    data: { type: 'week', month: monthIndex, week: key }
  })
  const totals = monthTotals(cards)
  const title = week ? `KW ${week.week}` : 'Ohne KW'
  return (
    <section
      ref={setNodeRef}
      className={`week-group${cards.length === 0 ? ' is-empty' : ''}${dragging && isOver ? ' is-drop-target' : ''}`}
      data-week={key ?? 'none'}
      aria-label={week ? `${title}, ${formatWeekDates(week)}` : title}
    >
      {/* Row 1: week left, dates right. Row 2 (only with cards): time left, revenue right, one line per currency. */}
      <h3 className="week-heading">
        <span className="week-title">{title}</span>
        {week && <span className="week-dates">{formatWeekDates(week)}</span>}
      </h3>
      {cards.length > 0 && (
        <div className="week-totals" aria-label={`Summe ${title}`}>
          <span>{formatDurationRange(...totals.minutes)}</span>
          <span className="week-revenue">
            {(['CHF', 'EUR'] as const).map((currency) => {
              const range = totals.revenue[currency]
              return range ? (
                <span key={currency}>
                  {formatRange(...range)} {currency}
                </span>
              ) : null
            })}
          </span>
        </div>
      )}
      {children}
    </section>
  )
}
