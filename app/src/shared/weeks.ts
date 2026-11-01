import type { Card } from './types'

const DAY_MS = 86_400_000

export interface MonthWeek {
  week: number
  /** First and last day of the ISO week (Monday–Sunday), as UTC dates. */
  start: Date
  end: Date
}

/** ISO 8601 calendar week: weeks start on Monday, week 1 contains the year's first Thursday. */
export function isoWeek(date: Date): number {
  const day = new Date(0)
  day.setUTCFullYear(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7))
  const yearStart = new Date(0)
  yearStart.setUTCFullYear(day.getUTCFullYear(), 0, 1)
  return Math.ceil(((day.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7)
}

/** All ISO weeks whose Monday–Sunday overlaps the month, so boundary weeks appear in both months. */
export function monthWeeks(year: number, month: number): MonthWeek[] {
  // setUTCFullYear keeps years below 100 literal, unlike Date.UTC.
  const first = new Date(0)
  first.setUTCFullYear(year, month, 1)
  const last = new Date(0)
  last.setUTCFullYear(year, month + 1, 0)
  const start = new Date(first.getTime() - ((first.getUTCDay() || 7) - 1) * DAY_MS)
  const weeks: MonthWeek[] = []
  for (let monday = start; monday <= last; monday = new Date(monday.getTime() + 7 * DAY_MS)) {
    weeks.push({
      week: isoWeek(monday),
      start: monday,
      end: new Date(monday.getTime() + 6 * DAY_MS)
    })
  }
  return weeks
}

export function isWeek(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 53
}

/** The card's week if it belongs to this month, otherwise null ("Ohne KW"). */
export function cardWeek(card: Pick<Card, 'week'>, weeks: MonthWeek[]): number | null {
  return card.week !== undefined && weeks.some((entry) => entry.week === card.week)
    ? card.week
    : null
}

export interface WeekGroup<T> {
  week: number | null
  cards: T[]
}

/** "Ohne KW" first, then the month's weeks in calendar order; cards keep their relative order. */
export function groupByWeek<T extends Pick<Card, 'week' | 'order'>>(
  cards: T[],
  weeks: MonthWeek[]
): WeekGroup<T>[] {
  const sorted = [...cards].sort((a, b) => a.order - b.order)
  return [null, ...weeks.map((entry) => entry.week)].map((week) => ({
    week,
    cards: sorted.filter((card) => cardWeek(card, weeks) === week)
  }))
}

export function formatWeekDates({ start, end }: MonthWeek): string {
  const day = (date: Date): string => `${date.getUTCDate()}.`
  const full = (date: Date): string => `${date.getUTCDate()}.${date.getUTCMonth() + 1}.`
  return start.getUTCMonth() === end.getUTCMonth()
    ? `${day(start)}–${full(end)}`
    : `${full(start)}–${full(end)}`
}
