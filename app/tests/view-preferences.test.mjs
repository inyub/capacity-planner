import test from 'node:test'
import assert from 'node:assert/strict'
import {
  defaultViewPosition,
  readColumnWidth,
  readViewPosition
} from '../src/renderer/src/viewPreferences.ts'

test('column width restores boundaries and falls back for corrupt or unsupported preferences', () => {
  for (const width of [180, 252, 315, 360]) assert.equal(readColumnWidth(String(width)), width)
  for (const value of [null, '', 'NaN', 'Infinity', '179', '361', '252.5', '300px'])
    assert.equal(readColumnWidth(value), 252)
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
