import assert from 'node:assert/strict'
import test from 'node:test'
import { yearBoardWidth } from '../src/shared/window-width.ts'

test('window width limit matches twelve month columns plus the shell border', () => {
  assert.equal(yearBoardWidth(180), 2162)
  assert.equal(yearBoardWidth(252), 3026)
  assert.equal(yearBoardWidth(360), 4322)
})
