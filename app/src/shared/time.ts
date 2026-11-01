import type { TimeUnit } from './types'

export const MINUTES_PER_UNIT: Record<TimeUnit, number> = { m: 1, h: 60, d: 1440 }

export function isTimeUnit(value: unknown): value is TimeUnit {
  return value === 'm' || value === 'h' || value === 'd'
}

// Decimal arithmetic makes exact half minutes round up, including values such as 0.075h.
export function toMinutes(value: number, unit: TimeUnit): number | null {
  if (!Number.isFinite(value) || value < 0) return null
  return roundMinutes(String(value), unit)
}

function roundMinutes(value: string, unit: TimeUnit): number | null {
  const [coefficient, exponent = '0'] = value.split('e')
  const [whole, fraction = ''] = coefficient.split('.')
  const power = Number(exponent) - fraction.length
  const numerator = BigInt(whole + fraction) * BigInt(MINUTES_PER_UNIT[unit])
  const denominator = power < 0 ? 10n ** BigInt(-power) : 1n
  const scaled = power > 0 ? numerator * 10n ** BigInt(power) : numerator
  const rounded = Number((scaled * 2n + denominator) / (denominator * 2n))
  return Number.isSafeInteger(rounded) ? rounded : null
}

export function parseRange(value: string): [number, number] | null {
  if (!/^\d+(?:[.,]\d+)?(?:\s*-\s*\d+(?:[.,]\d+)?)?$/.test(value.trim())) return null
  const [min, max = min] = value
    .trim()
    .split(/\s*-\s*/)
    .map((part) => Number(part.replace(',', '.')))
  return Number.isFinite(min) && Number.isFinite(max) && min <= max ? [min, max] : null
}

export function inputRange(min: number, max: number): string {
  const number = (value: number): string => String(value).replace('.', ',')
  return min === max ? number(min) : `${number(min)}-${number(max)}`
}

export function parseTime(
  value: string,
  defaultUnit: TimeUnit
): {
  minutesMin: number
  minutesMax: number
  timeUnit: TimeUnit
} | null {
  const match = value.trim().match(/^(.*?)([mhd])?$/i)
  if (!match) return null
  const unit = match[2]?.toLowerCase() ?? defaultUnit
  if (!isTimeUnit(unit)) return null
  const range = parseRange(match[1].trim())
  if (!range) return null
  const [start, end = start] = match[1]
    .trim()
    .split(/\s*-\s*/)
    .map((part) => part.replace(',', '.'))
  const [startWhole, startFraction = ''] = start.split('.')
  const [endWhole, endFraction = ''] = end.split('.')
  const scale = Math.max(startFraction.length, endFraction.length)
  if (
    BigInt(startWhole + startFraction.padEnd(scale, '0')) >
    BigInt(endWhole + endFraction.padEnd(scale, '0'))
  )
    return null
  const min = roundMinutes(start, unit)
  const max = roundMinutes(end, unit)
  return min === null || max === null ? null : { minutesMin: min, minutesMax: max, timeUnit: unit }
}

// Six decimal places in any supported unit round back to the same whole minute.
export function timeInput(min: number, max: number, unit: TimeUnit): string {
  const number = (minutes: number): string => {
    const factor = BigInt(MINUTES_PER_UNIT[unit])
    const whole = BigInt(minutes) / factor
    const fraction = (((BigInt(minutes) % factor) * 10n ** 6n) / factor)
      .toString()
      .padStart(6, '0')
      .replace(/0+$/, '')
    return fraction ? `${whole},${fraction}` : String(whole)
  }
  return min === max ? number(min) : `${number(min)}-${number(max)}`
}

export function formatCardTime(min: number, max: number, unit: TimeUnit): string {
  const number = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 8 })
  const start = number.format(min / MINUTES_PER_UNIT[unit])
  const end = number.format(max / MINUTES_PER_UNIT[unit])
  return `${min === max ? start : `${start}-${end}`} ${unit}`
}

export function formatDuration(minutes: number): string {
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  return `${days}d ${hours}h ${minutes % 60}m`
}

export function formatDurationRange(min: number, max: number): string {
  return min === max ? formatDuration(min) : `${formatDuration(min)} – ${formatDuration(max)}`
}
