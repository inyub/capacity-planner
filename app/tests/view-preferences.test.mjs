import test from 'node:test'
import assert from 'node:assert/strict'
import { readColumnWidth } from '../src/renderer/src/viewPreferences.ts'

test('column width restores boundaries and falls back for corrupt or unsupported preferences', () => {
  for (const width of [180, 252, 315, 360]) assert.equal(readColumnWidth(String(width)), width)
  for (const value of [null, '', 'NaN', 'Infinity', '179', '361', '252.5', '300px'])
    assert.equal(readColumnWidth(value), 252)
})
