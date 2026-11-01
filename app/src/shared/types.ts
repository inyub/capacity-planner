import type { UpdateApi } from './updates'

export type TimeUnit = 'm' | 'h' | 'd'

export type Currency = 'EUR' | 'CHF'

export interface Card {
  id: string
  year: number
  month: number
  order: number
  label: string
  title: string
  description: string
  minutesMin: number
  minutesMax: number
  timeUnit: TimeUnit
  revenueMin: number
  revenueMax: number
  currency: Currency
  expanded: boolean
}

export interface WindowBounds {
  width: number
  height: number
  x?: number
  y?: number
}

export interface AppData {
  version: 2
  cards: Card[]
  window?: WindowBounds
  appearance?: ThemeState
}

export type ThemeColors = Record<
  | 'canvas'
  | 'header'
  | 'header-highlight'
  | 'column'
  | 'column-highlight'
  | 'surface-dark'
  | 'surface-dark-highlight'
  | 'card'
  | 'card-highlight'
  | 'field'
  | 'line'
  | 'line-light'
  | 'text'
  | 'muted'
  | 'accent'
  | 'accent-strong'
  | 'danger'
  | 'scrollbar'
  | 'scrollbar-hover',
  string
>

export interface PlannerTheme {
  id: string
  name: string
  baseId: string
  colors: ThemeColors
}

export interface ThemeState {
  activeId: string
  themes: PlannerTheme[]
}

export interface CapacityPlannerApi extends UpdateApi {
  exportPlanning: () => Promise<boolean>
  previewPlanning: () => Promise<PlanningPreview | null>
  cancelPlanning: () => Promise<void>
  confirmPlanning: (token: string) => Promise<AppData>
  loadData: () => Promise<AppData>
  saveData: (data: AppData) => Promise<{ saved: boolean }>
  closeApp: () => Promise<void>
  minimizeWindow: () => Promise<void>
  toggleMaximizeWindow: () => Promise<void>
  toggleFullscreen: () => Promise<void>
  setWindowWidthLimit: (width: number) => Promise<void>
  showHeaderMenu: () => Promise<void>
  onOpenSettings: (callback: () => void) => () => void
}

export interface PlanningPreview {
  token: string
  fileName: string
  dataVersion: number
  cardCount: number
  years: { year: number; count: number }[]
  existingCardCount: number
  existingYears: number[]
}
