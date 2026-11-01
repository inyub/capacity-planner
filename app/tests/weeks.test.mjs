import assert from 'node:assert/strict'
import test from 'node:test'
import { cardWeek, formatWeekDates, groupByWeek, isoWeek, monthWeeks } from '../src/shared/weeks.ts'
import { monthTotals } from '../src/shared/totals.ts'

const utc = (year, month, day) => new Date(Date.UTC(year, month, day))

test('ISO calendar weeks across year boundaries', () => {
  assert.equal(isoWeek(utc(2026, 10, 2)), 45)
  assert.equal(isoWeek(utc(2026, 0, 1)), 1)
  assert.equal(isoWeek(utc(2020, 11, 31)), 53)
  assert.equal(isoWeek(utc(2021, 0, 3)), 53)
  assert.equal(isoWeek(utc(2024, 11, 30)), 1)
})

test('a month lists every week that overlaps it, including boundary weeks', () => {
  const november = monthWeeks(2026, 10)
  assert.deepEqual(
    november.map((entry) => entry.week),
    [44, 45, 46, 47, 48, 49]
  )
  assert.equal(formatWeekDates(november[0]), '26.10.–1.11.')
  assert.equal(formatWeekDates(november[1]), '2.–8.11.')
  assert.deepEqual(
    monthWeeks(2021, 0).map((entry) => entry.week),
    [53, 1, 2, 3, 4]
  )
  assert.deepEqual(
    monthWeeks(2024, 11).map((entry) => entry.week),
    [48, 49, 50, 51, 52, 1]
  )
  assert.equal(monthWeeks(15, 1).length, 5)
  assert.equal(monthWeeks(2021, 1).length, 4)
  assert.equal(monthWeeks(2026, 1).length, 5)
})

test('grouping keeps order, puts cards without a week of this month into "Ohne KW"', () => {
  const weeks = monthWeeks(2026, 10)
  const cards = [
    { id: 'a', order: 3, week: 46 },
    { id: 'b', order: 0 },
    { id: 'c', order: 1, week: 46 },
    { id: 'd', order: 2, week: 12 }
  ]
  assert.equal(cardWeek(cards[3], weeks), null)
  const groups = groupByWeek(cards, weeks)
  assert.deepEqual(
    groups.map((group) => [group.week, group.cards.map((card) => card.id)]),
    [
      [null, ['b', 'd']],
      [44, []],
      [45, []],
      [46, ['c', 'a']],
      [47, []],
      [48, []],
      [49, []]
    ]
  )
})

test('week totals reuse the month sum per currency and range', () => {
  const totals = monthTotals([
    { minutesMin: 60, minutesMax: 120, revenueMin: 100, revenueMax: 200, currency: 'EUR' },
    { minutesMin: 30, minutesMax: 30, revenueMin: 50, revenueMax: 50, currency: 'CHF' }
  ])
  assert.deepEqual(totals, { minutes: [90, 150], revenue: { CHF: [50, 50], EUR: [100, 200] } })
})
