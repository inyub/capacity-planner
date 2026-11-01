import type { Card, Currency } from './types'

const numberFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 20 })

export function formatRange(min: number, max: number): string {
  return min === max
    ? numberFormat.format(min)
    : `${numberFormat.format(min)}-${numberFormat.format(max)}`
}

// Add the decimal representations, avoiding binary artifacts such as 0.1 + 0.2.
export function sumDecimals(values: number[]): number {
  if (values.length === 0) return 0
  const parts = values.map((value) => {
    const [coefficient, power = '0'] = String(value).split('e')
    const [whole, fraction = ''] = coefficient.split('.')
    return { digits: BigInt(whole + fraction), power: Number(power) - fraction.length }
  })
  const power = Math.min(...parts.map((part) => part.power))
  const sum = parts.reduce(
    (total, part) => total + part.digits * 10n ** BigInt(part.power - power),
    0n
  )
  return Number(`${sum}e${power}`)
}

export function monthTotals(cards: Card[]): {
  minutes: [number, number]
  revenue: Partial<Record<Currency, [number, number]>>
} {
  const revenue: Partial<Record<Currency, [number, number]>> = {}
  for (const currency of ['CHF', 'EUR'] as const) {
    const matching = cards.filter((card) => card.currency === currency)
    if (matching.length > 0) {
      revenue[currency] = [
        sumDecimals(matching.map((card) => card.revenueMin)),
        sumDecimals(matching.map((card) => card.revenueMax))
      ]
    }
  }
  return {
    minutes: [
      sumDecimals(cards.map((card) => card.minutesMin)),
      sumDecimals(cards.map((card) => card.minutesMax))
    ],
    revenue
  }
}
