import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseTime,
  toMinutes,
  timeInput,
  formatCardTime,
  formatDurationRange
} from '../src/shared/time.ts'
import { migrateAppData, isAppData } from '../src/shared/migration.ts'
import { defaultThemeState } from '../src/shared/themes.ts'
import { monthTotals } from '../src/shared/totals.ts'

const oldCard = {
  id: 'old',
  year: 2026,
  month: 1,
  order: 3,
  label: 'Kundin',
  title: 'Satz',
  description: 'Zeile 1\nZeile 2',
  hoursMin: 10,
  hoursMax: 15,
  revenueMin: 150,
  revenueMax: 300,
  currency: 'CHF',
  expanded: false
}

test('suffixes, decimal commas, ranges and zero use whole minutes and 24-hour days', () => {
  for (const [input, min, max, unit] of [
    ['90m', 90, 90, 'm'],
    ['1.5h', 90, 90, 'h'],
    ['1d', 1440, 1440, 'd'],
    ['1-2d', 1440, 2880, 'd'],
    ['1,5 - 2,5 H', 90, 150, 'h'],
    ['0m', 0, 0, 'm'],
    ['0.075h', 5, 5, 'h'],
    ['0.5m', 1, 1, 'm'],
    ['0.49m', 0, 0, 'm'],
    ['0.49999999999999999m', 0, 0, 'm'],
    ['0.50000000000000001m', 1, 1, 'm'],
    ['0.1-0.2h', 6, 12, 'h']
  ])
    assert.deepEqual(
      parseTime(input, 'h'),
      { minutesMin: min, minutesMax: max, timeUnit: unit },
      input
    )
  assert.deepEqual(parseTime('1-2', 'd'), parseTime('1-2d', 'm'))
  for (const invalid of [
    '',
    '-1',
    '2-1h',
    '1h-2h',
    '1-2-3',
    '2w',
    '1e3',
    'NaN',
    'Infinity',
    '1,2.3',
    '9'.repeat(400)
  ]) {
    assert.equal(parseTime(invalid, 'h'), null, invalid)
  }
  assert.equal(toMinutes(Infinity, 'h'), null)
  assert.equal(toMinutes(-1, 'm'), null)
  assert.equal(toMinutes(Number.MAX_SAFE_INTEGER, 'd'), null)
})

test('unit changes and edit round trips preserve every minute including repeating decimals', () => {
  for (const min of [0, 1, 2, 59, 60, 90, 1439, 1440, 1000001, Number.MAX_SAFE_INTEGER - 13]) {
    for (const unit of ['m', 'h', 'd']) {
      assert.deepEqual(parseTime(timeInput(min, min + 13, unit), unit), {
        minutesMin: min,
        minutesMax: min + 13,
        timeUnit: unit
      })
    }
  }
  assert.equal(formatCardTime(600, 900, 'h'), '10-15 h')
  assert.equal(formatDurationRange(90, 90), '0d 1h 30m')
  assert.equal(formatDurationRange(90, 1440), '0d 1h 30m – 1d 0h 0m')
  assert.equal(formatDurationRange(0, 0), '0d 0h 0m')
})

test('version 1 migrates HOURS, preserves metadata and window, and is idempotent', () => {
  const original = {
    version: 1,
    cards: [oldCard],
    appearance: defaultThemeState(),
    window: { width: 1000, height: 650, x: 3, y: 4 }
  }
  const snapshot = structuredClone(original)
  const migrated = migrateAppData(original)
  const { hoursMin, hoursMax, ...metadata } = oldCard
  assert.deepEqual(migrated, {
    ...original,
    version: 2,
    cards: [{ ...metadata, minutesMin: hoursMin * 60, minutesMax: hoursMax * 60, timeUnit: 'h' }]
  })
  assert.deepEqual(original, snapshot)
  assert.deepEqual(migrateAppData(migrated), migrated)
  assert.deepEqual(migrateAppData(JSON.parse(JSON.stringify(migrated))), migrated)
  const decimal = migrateAppData({
    version: 1,
    cards: [{ ...oldCard, hoursMin: 0.075, hoursMax: 0.1 }]
  })
  assert.deepEqual([decimal.cards[0].minutesMin, decimal.cards[0].minutesMax], [5, 6])
})

test('migration rejects unknown versions and malformed data without partial conversion', () => {
  for (const value of [
    null,
    {},
    { version: 3, cards: [] },
    { version: 1, cards: [{ ...oldCard, hoursMin: -1 }] },
    { version: 1, cards: [oldCard, oldCard] },
    { version: 1, cards: [{ ...oldCard, hoursMax: Infinity }] },
    { version: 2, cards: [oldCard] }
  ])
    assert.equal(migrateAppData(value), null)
  const current = migrateAppData({ version: 1, cards: [oldCard] })
  for (const change of [
    { minutesMin: 0.5 },
    { minutesMin: -1 },
    { minutesMax: 0 },
    { timeUnit: 'w' },
    { minutesMax: Number.MAX_SAFE_INTEGER + 1 },
    { currency: 'USD' },
    { month: 12 }
  ]) {
    assert.equal(isAppData({ ...current, cards: [{ ...current.cards[0], ...change }] }), false)
  }
})

test('mixed units sum minutes componentwise and keep currencies separate', () => {
  const cards = ['90m', '1.5h', '1-2d', '0m'].map((value, i) => ({
    ...oldCard,
    id: String(i),
    ...parseTime(value, 'h'),
    currency: i === 0 ? 'EUR' : 'CHF'
  }))
  const totals = monthTotals(cards)
  assert.deepEqual(totals.minutes, [1620, 3060])
  assert.equal(formatDurationRange(...totals.minutes), '1d 3h 0m – 2d 3h 0m')
  assert.deepEqual(totals.revenue, { EUR: [150, 300], CHF: [450, 900] })
})

test('the optional calendar week loads unchanged; existing files without it stay valid', () => {
  const migrated = migrateAppData({ version: 1, cards: [oldCard] })
  assert.equal('week' in migrated.cards[0], false)
  const withWeek = { ...migrated, cards: [{ ...migrated.cards[0], week: 6 }] }
  assert.equal(migrateAppData(withWeek), withWeek)
  for (const week of [0, 54, 2.5, '6', null])
    assert.equal(isAppData({ ...migrated, cards: [{ ...migrated.cards[0], week }] }), false)
})
