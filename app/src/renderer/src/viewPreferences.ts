export const DEFAULT_COLUMN_WIDTH = 252
export const MIN_COLUMN_WIDTH = 180
export const MAX_COLUMN_WIDTH = 360
export const COLUMN_WIDTH_KEY = 'capacity-planner:column-width'

export function readColumnWidth(value: string | null): number {
  const width = Number(value)
  return value !== null &&
    Number.isInteger(width) &&
    width >= MIN_COLUMN_WIDTH &&
    width <= MAX_COLUMN_WIDTH
    ? width
    : DEFAULT_COLUMN_WIDTH
}
