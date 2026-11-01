import assert from 'node:assert/strict'
import test from 'node:test'
import { moveCard } from '../src/shared/card-order.ts'

const cards = [
  { id: 'A', year: 2026, month: 0, order: 0, title: 'A', expanded: true },
  { id: 'B', year: 2026, month: 0, order: 4, title: 'B', expanded: false },
  { id: 'C', year: 2026, month: 0, order: 9, title: 'C', expanded: true },
  { id: 'D', year: 2026, month: 1, order: 7, title: 'D', expanded: false },
  { id: 'other-year', year: 2027, month: 0, order: 8 },
  { id: 'other-month', year: 2026, month: 11, order: 8 }
].map(Object.freeze)
Object.freeze(cards)
const list = (result, month) =>
  result
    .filter((card) => card.year === 2026 && card.month === month)
    .sort((a, b) => a.order - b.order)
    .map(({ id, order }) => [id, order])

test('reorder both directions, normalize gaps, preserve metadata and unrelated lists', () => {
  const result = moveCard(cards, 2026, 'A', 0, 2)
  assert.deepEqual(list(result, 0), [
    ['B', 0],
    ['C', 1],
    ['A', 2]
  ])
  assert.equal(result[0].expanded, true)
  assert.equal(result[0].title, 'A')
  assert.equal(result[3], cards[3])
  assert.equal(result[4], cards[4])
  assert.equal(result[5], cards[5])
  assert.deepEqual(list(moveCard(result, 2026, 'A', 0, 0), 0), [
    ['A', 0],
    ['B', 1],
    ['C', 2]
  ])
  assert.equal(cards[1].order, 4)
})

test('cross-month insert at beginning/end and into empty month, normalize source and destination', () => {
  let result = moveCard(cards, 2026, 'B', 1, 0)
  assert.deepEqual(list(result, 0), [
    ['A', 0],
    ['C', 1]
  ])
  assert.deepEqual(list(result, 1), [
    ['B', 0],
    ['D', 1]
  ])
  result = moveCard(result, 2026, 'A', 1, 2)
  assert.deepEqual(list(result, 1), [
    ['B', 0],
    ['D', 1],
    ['A', 2]
  ])
  result = moveCard(result, 2026, 'C', 2, 0)
  assert.deepEqual(list(result, 0), [])
  assert.deepEqual(list(result, 2), [['C', 0]])
  assert.equal(result[4], cards[4])
})

test('no-op drops and invalid year/month/id never move cards', () => {
  const normalized = moveCard(cards, 2026, 'A', 0, 0)
  assert.equal(moveCard(normalized, 2026, 'A', 0, 0), normalized)
  assert.equal(moveCard(cards, 2026, 'other-year', 1, 0), cards)
  assert.equal(moveCard(cards, 2026, 'missing', 1, 0), cards)
  assert.equal(moveCard(cards, 2026, 'A', 12, 0), cards)
})
