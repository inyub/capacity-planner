import type { Card } from './types'

/** Insert into the destination list after removing the moving card. Only normalize affected months. */
export function moveCard(
  cards: Card[],
  year: number,
  id: string,
  month: number,
  index: number
): Card[] {
  const active = cards.find((card) => card.id === id && card.year === year)
  if (!active || !Number.isInteger(month) || month < 0 || month > 11) return cards
  const destination = cards
    .filter((card) => card.year === year && card.month === month && card.id !== id)
    .sort((a, b) => a.order - b.order)
  destination.splice(Math.max(0, Math.min(index, destination.length)), 0, active)
  const positions = new Map(destination.map((card, order) => [card.id, { month, order }]))
  if (active.month !== month) {
    cards
      .filter((card) => card.year === year && card.month === active.month && card.id !== id)
      .sort((a, b) => a.order - b.order)
      .forEach((card, order) => positions.set(card.id, { month: active.month, order }))
  }
  let changed = false
  const next = cards.map((card) => {
    const position = positions.get(card.id)
    if (!position || (position.month === card.month && position.order === card.order)) return card
    changed = true
    return { ...card, ...position }
  })
  return changed ? next : cards
}
