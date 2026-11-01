import assert from 'node:assert/strict'
import test from 'node:test'
import { createPlanningFile, readPlanningFile } from '../src/shared/planning-transfer.ts'

const card = {
  id: 'one',
  year: 2026,
  month: 0,
  order: 7,
  label: 'Kundin',
  title: 'Thema',
  description: 'Zeile 1\nZeile 2',
  minutesMin: 90,
  minutesMax: 1440,
  timeUnit: 'd',
  revenueMin: 0.1,
  revenueMax: 150.5,
  currency: 'CHF',
  expanded: false
}

test('planning round-trip preserves all fields across years and strips non-planning properties', () => {
  const cards = [card, { ...card, id: 'two', year: 2027, month: 11, timeUnit: 'm', week: 49 }]
  const file = createPlanningFile(cards.map((c) => ({ ...c, appearance: {}, window: {} })))
  assert.deepEqual(Object.keys(file), ['format', 'formatVersion', 'dataVersion', 'cards'])
  assert.deepEqual(readPlanningFile(JSON.parse(JSON.stringify(file))), cards)
  assert.deepEqual(
    readPlanningFile({ ...file, appearance: {}, window: {}, preferences: {} }),
    cards
  )
  assert.deepEqual(readPlanningFile(createPlanningFile([])), [])
})

test('legacy transfer treats hours as hours and uses the existing minute rounding', () => {
  const rest = { ...card }
  delete rest.minutesMin
  delete rest.minutesMax
  delete rest.timeUnit
  const file = {
    ...createPlanningFile([]),
    dataVersion: 1,
    cards: [{ ...rest, hoursMin: 0.075, hoursMax: 24 }]
  }
  const original = JSON.stringify(file)
  assert.deepEqual(readPlanningFile(file), [
    { ...rest, minutesMin: 5, minutesMax: 1440, timeUnit: 'h' }
  ])
  assert.equal(JSON.stringify(file), original)
})

test('transfer rejects unsupported versions, wrong types, ranges, units, currencies and duplicate IDs', () => {
  const file = createPlanningFile([card])
  for (const invalid of [
    null,
    [],
    {},
    { ...file, format: 'other' },
    { ...file, formatVersion: 2 },
    { ...file, dataVersion: 3 },
    { ...file, dataVersion: '2' },
    { ...file, cards: {} },
    { ...file, cards: [card, card] }
  ])
    assert.throws(() => readPlanningFile(invalid))
  for (const [key, values] of Object.entries({
    id: ['', 7, null],
    year: [0, 10000, 2.5, '2026'],
    month: [-1, 12, 0.5],
    order: [-1, 0.5, Number.MAX_SAFE_INTEGER + 1],
    label: [null],
    title: [7],
    description: [[]],
    minutesMin: [-1, 0.5, 1441, Infinity],
    minutesMax: [89, Number.MAX_SAFE_INTEGER + 1],
    timeUnit: ['w', 'H', null],
    revenueMin: [-1, 151, NaN],
    revenueMax: [0, Infinity],
    currency: ['USD', null],
    expanded: ['false', 0],
    week: [0, 54, 1.5, '45', null]
  }))
    for (const value of values)
      assert.throws(
        () => readPlanningFile({ ...file, cards: [{ ...card, [key]: value }] }),
        `${key}: ${value}`
      )
  for (const hours of [-1, Infinity, '1'])
    assert.throws(() =>
      readPlanningFile({
        ...file,
        dataVersion: 1,
        cards: [{ ...card, hoursMin: hours, hoursMax: 24 }]
      })
    )
})
