import test from 'node:test'
import assert from 'node:assert/strict'
import { readStoredYear } from '../src/renderer/src/year.ts'

test('restores a valid selected year and ignores invalid stored values', () => {
  assert.equal(readStoredYear('2027', 2026), 2027)
  assert.equal(readStoredYear('0', 2026), 2026)
  assert.equal(readStoredYear('10000', 2026), 2026)
  assert.equal(readStoredYear('not-a-year', 2026), 2026)
  assert.equal(readStoredYear(null, 2026), 2026)
})
