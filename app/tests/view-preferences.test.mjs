import test from 'node:test'
import assert from 'node:assert/strict'
import {
  defaultViewPosition,
  readColumnWidth,
  readUiScale,
  readWeekGrouping,
  readViewPosition
} from '../src/renderer/src/viewPreferences.ts'

test('column width restores boundaries and falls back for corrupt or unsupported preferences', () => {
  for (const width of [100, 250, 315, 360]) assert.equal(readColumnWidth(String(width)), width)
  for (const value of [null, '', 'NaN', 'Infinity', '99', '361', '252.5', '300px'])
    assert.equal(readColumnWidth(value), 250)
})

test('view position restores valid scroll offsets and the focused card', () => {
  const tops = [120, 0, 40, 0, 0, 0, 0, 0, 0, 0, 0, 300]
  const stored = JSON.stringify({ boardLeft: 480, columnTops: tops, focusedCardId: 'card-7' })
  assert.deepEqual(readViewPosition(stored), {
    boardLeft: 480,
    columnTops: tops,
    focusedCardId: 'card-7'
  })
})

test('view position falls back for unreadable data without blocking the start', () => {
  for (const value of [null, '', '{', 'null', '42', '"text"', '[]'])
    assert.deepEqual(readViewPosition(value), defaultViewPosition())
})

test('damaged view position fields fall back individually', () => {
  const position = readViewPosition(
    JSON.stringify({
      boardLeft: -10,
      columnTops: [5, 'x', Number.NaN, 7, -1, 2],
      focusedCardId: 42
    })
  )
  assert.equal(position.boardLeft, 0)
  assert.deepEqual(position.columnTops, [5, 0, 0, 7, 0, 2, 0, 0, 0, 0, 0, 0])
  assert.equal(position.focusedCardId, null)
})

test('UI scale restores 50 to 150 percent in steps of five and falls back otherwise', () => {
  for (const scale of [50, 95, 100, 150]) assert.equal(readUiScale(String(scale)), scale)
  for (const value of [null, '', 'NaN', '45', '155', '102', '100.5', '100%'])
    assert.equal(readUiScale(value), 100)
})

test('week grouping is off unless explicitly stored as on', () => {
  assert.equal(readWeekGrouping('true'), true)
  for (const value of [null, '', 'false', '1', 'TRUE']) assert.equal(readWeekGrouping(value), false)
})
