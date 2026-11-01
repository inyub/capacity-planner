import type { Card } from './types'
import { groupByWeek, monthWeeks } from './weeks.ts'

interface Position {
  month: number
  order: number
  week?: number
}

/**
 * Insert into the destination list after removing the moving card. Only normalize affected months.
 * With `week` (a calendar week, or null for "Ohne KW") the index is relative to that week group and
 * the month is renumbered in grouped display order. Without it, a move to another month drops the week.
 */
export function moveCard(
  cards: Card[],
  year: number,
  id: string,
  month: number,
  index: number,
  week?: number | null
): Card[] {
  const active = cards.find((card) => card.id === id && card.year === year)
  if (!active || !Number.isInteger(month) || month < 0 || month > 11) return cards
  const grouped = week !== undefined
  const weeks = monthWeeks(year, month)
  if (grouped && week !== null && !weeks.some((entry) => entry.week === week)) return cards
  const inMonth = (target: number): Card[] =>
    cards.filter((card) => card.year === year && card.month === target && card.id !== id)
  const ordered = (target: number): Card[] =>
    grouped
      ? groupByWeek(inMonth(target), monthWeeks(year, target)).flatMap((group) => group.cards)
      : inMonth(target).sort((a, b) => a.order - b.order)
  const activeWeek = grouped
    ? (week ?? undefined)
    : active.month === month
      ? active.week
      : undefined
  const moved = { ...active, week: activeWeek }
  let destination: Card[]
  if (grouped) {
    const groups = groupByWeek(inMonth(month), weeks)
    const target = groups.find((group) => group.week === week)!
    target.cards.splice(Math.max(0, Math.min(index, target.cards.length)), 0, moved)
    destination = groups.flatMap((group) => group.cards)
  } else {
    destination = ordered(month)
    destination.splice(Math.max(0, Math.min(index, destination.length)), 0, moved)
  }
  const positions = new Map<string, Position>(
    destination.map((card, order) => [card.id, { month, order, week: card.week }])
  )
  if (active.month !== month) {
    ordered(active.month).forEach((card, order) =>
      positions.set(card.id, { month: active.month, order, week: card.week })
    )
  }
  let changed = false
  const next = cards.map((card) => {
    const position = positions.get(card.id)
    if (
      !position ||
      (position.month === card.month &&
        position.order === card.order &&
        position.week === card.week)
    )
      return card
    changed = true
    const updated: Card = { ...card, ...position }
    // An absent week means "Ohne KW"; never store it as an explicit undefined.
    if (position.week === undefined) delete updated.week
    return updated
  })
  return changed ? next : cards
}
