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

export const VIEW_POSITION_KEY = 'capacity-planner:view-position'
const MONTH_COUNT = 12

export interface ViewPosition {
  boardLeft: number
  columnTops: number[]
  focusedCardId: string | null
}

export function defaultViewPosition(): ViewPosition {
  return {
    boardLeft: 0,
    columnTops: Array.from({ length: MONTH_COUNT }, () => 0),
    focusedCardId: null
  }
}

function readOffset(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0
}

// Invalid fields fall back individually, so one damaged value never blocks the others or the start.
export function readViewPosition(value: string | null): ViewPosition {
  const fallback = defaultViewPosition()
  let parsed: unknown
  try {
    parsed = JSON.parse(value ?? 'null')
  } catch {
    return fallback
  }
  if (!parsed || typeof parsed !== 'object') return fallback
  const record = parsed as Record<string, unknown>
  const tops = Array.isArray(record.columnTops) ? record.columnTops : []
  return {
    boardLeft: readOffset(record.boardLeft),
    columnTops: fallback.columnTops.map((_, month) => readOffset(tops[month])),
    focusedCardId:
      typeof record.focusedCardId === 'string' && record.focusedCardId !== ''
        ? record.focusedCardId
        : null
  }
}
