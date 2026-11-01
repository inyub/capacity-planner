import assert from 'node:assert/strict'
import test from 'node:test'
import { formatRange, monthTotals, sumDecimals } from '../src/shared/totals.ts'

const card = (currency, minutesMin, minutesMax, revenueMin, revenueMax) => ({
  currency,
  minutesMin,
  minutesMax,
  revenueMin,
  revenueMax
})

test('empty month, scalar/range minutes and separate currencies', () => {
  assert.deepEqual(monthTotals([]), { minutes: [0, 0], revenue: {} })
  const totals = monthTotals([
    card('EUR', 10, 15, 150, 300),
    card('EUR', 20, 20, 50, 50),
    card('CHF', 0, 0, 1000, 1000)
  ])
  assert.deepEqual(totals, { minutes: [30, 35], revenue: { CHF: [1000, 1000], EUR: [200, 350] } })
  assert.equal(formatRange(...totals.minutes), '30-35')
  assert.equal(formatRange(1000, 1000), '1.000')
})

test('decimal addition, small exponents and many repeated values have no binary artifacts', () => {
  assert.equal(sumDecimals([0.1, 0.2]), 0.3)
  assert.equal(sumDecimals([0.1, 0.1, 0.1]), 0.3)
  assert.equal(sumDecimals([1e-7, 2e-7]), 3e-7)
  assert.equal(sumDecimals([1e21, 1e21]), 2e21)
  assert.equal(sumDecimals(Array(1000).fill(0.1)), 100)
  assert.equal(formatRange(sumDecimals([0.1, 0.2]), sumDecimals([0.1, 0.2])), '0,3')
})

test('zero counts as a present currency and input cards remain unchanged', () => {
  const cards = [Object.freeze(card('CHF', 0, 0, 0, 0))]
  assert.deepEqual(monthTotals(Object.freeze(cards)), { minutes: [0, 0], revenue: { CHF: [0, 0] } })
})
