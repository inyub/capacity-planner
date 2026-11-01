import type { AppData, Card, WindowBounds } from './types'
import { isTimeUnit, toMinutes } from './time.ts'
import { isThemeState } from './themes.ts'
import { isWeek } from './weeks.ts'

function isRange(min: unknown, max: unknown): boolean {
  return (
    typeof min === 'number' &&
    typeof max === 'number' &&
    Number.isFinite(min) &&
    Number.isFinite(max) &&
    min >= 0 &&
    min <= max
  )
}

function isCard(value: unknown): value is Card {
  if (!value || typeof value !== 'object') return false
  const card = value as Partial<Card>
  return (
    typeof card.id === 'string' &&
    card.id.length > 0 &&
    Number.isInteger(card.year) &&
    (card.year ?? 0) >= 1 &&
    (card.year ?? 0) <= 9999 &&
    Number.isInteger(card.month) &&
    (card.month ?? -1) >= 0 &&
    (card.month ?? 12) <= 11 &&
    Number.isSafeInteger(card.order) &&
    (card.order ?? -1) >= 0 &&
    typeof card.label === 'string' &&
    typeof card.title === 'string' &&
    typeof card.description === 'string' &&
    isRange(card.minutesMin, card.minutesMax) &&
    Number.isSafeInteger(card.minutesMin) &&
    Number.isSafeInteger(card.minutesMax) &&
    isTimeUnit(card.timeUnit) &&
    isRange(card.revenueMin, card.revenueMax) &&
    (card.currency === 'EUR' || card.currency === 'CHF') &&
    typeof card.expanded === 'boolean' &&
    (card.week === undefined || isWeek(card.week))
  )
}

function isWindowBounds(value: unknown): value is WindowBounds {
  if (!value || typeof value !== 'object') return false
  const bounds = value as Partial<WindowBounds>
  return (
    typeof bounds.width === 'number' &&
    Number.isFinite(bounds.width) &&
    bounds.width > 0 &&
    typeof bounds.height === 'number' &&
    Number.isFinite(bounds.height) &&
    bounds.height > 0 &&
    (bounds.x === undefined || (typeof bounds.x === 'number' && Number.isFinite(bounds.x))) &&
    (bounds.y === undefined || (typeof bounds.y === 'number' && Number.isFinite(bounds.y)))
  )
}

export function isAppData(value: unknown): value is AppData {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<AppData>
  return (
    candidate.version === 2 &&
    Array.isArray(candidate.cards) &&
    candidate.cards.every(isCard) &&
    new Set(candidate.cards.map((card) => card.id)).size === candidate.cards.length &&
    (candidate.appearance === undefined || isThemeState(candidate.appearance)) &&
    (candidate.window === undefined || isWindowBounds(candidate.window))
  )
}

export function migrateAppData(value: unknown): AppData | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  if (source.version === 2) return isAppData(source) ? source : null
  if (source.version !== 1 || !Array.isArray(source.cards)) return null
  const cards: Record<string, unknown>[] = []
  for (const value of source.cards) {
    if (!value || typeof value !== 'object') return null
    const { hoursMin, hoursMax, ...rest } = value as Record<string, unknown>
    if (!isRange(hoursMin, hoursMax)) return null
    const minutesMin = toMinutes(hoursMin as number, 'h')
    const minutesMax = toMinutes(hoursMax as number, 'h')
    if (minutesMin === null || minutesMax === null) return null
    cards.push({ ...rest, minutesMin, minutesMax, timeUnit: 'h' })
  }
  const migrated = { ...source, version: 2, cards }
  return isAppData(migrated) ? migrated : null
}
