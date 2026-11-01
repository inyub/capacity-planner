import type { PlannerTheme, ThemeColors, ThemeState } from './types'

export const COLOR_FIELDS: { key: keyof ThemeColors; label: string }[] = [
  { key: 'canvas', label: 'Hintergrund' },
  { key: 'header', label: 'Kopfzeile' },
  { key: 'header-highlight', label: 'Kopfzeile · Verlauf' },
  { key: 'column', label: 'Monatsspalten' },
  { key: 'column-highlight', label: 'Spalten · Verlauf' },
  { key: 'surface-dark', label: 'Titel und Footer' },
  { key: 'surface-dark-highlight', label: 'Titel und Footer · Verlauf' },
  { key: 'card', label: 'Karten' },
  { key: 'card-highlight', label: 'Karten · Verlauf' },
  { key: 'field', label: 'Eingabefelder' },
  { key: 'line', label: 'Dunkle Konturen' },
  { key: 'line-light', label: 'Helle Konturen' },
  { key: 'text', label: 'Text' },
  { key: 'muted', label: 'Sekundärer Text' },
  { key: 'accent', label: 'Akzent' },
  { key: 'accent-strong', label: 'Fokus und Hervorhebung' },
  { key: 'danger', label: 'Fehler und Löschen' },
  { key: 'scrollbar', label: 'Scrollbalken' },
  { key: 'scrollbar-hover', label: 'Scrollbalken · Hover' }
]

export const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)

function lighten(hex: string, amount: number): string {
  return (
    '#' +
    [1, 3, 5]
      .map((offset) => {
        const channel = parseInt(hex.slice(offset, offset + 2), 16)
        return Math.round(channel + (255 - channel) * amount)
          .toString(16)
          .padStart(2, '0')
      })
      .join('')
  )
}

function palette(
  canvas: string,
  header: string,
  column: string,
  surface: string,
  card: string,
  accent: string,
  text = '#f3f1f8',
  muted = '#b6afc8'
): ThemeColors {
  return {
    canvas,
    header,
    'header-highlight': lighten(header, 0.045),
    column,
    'column-highlight': lighten(column, 0.025),
    'surface-dark': surface,
    'surface-dark-highlight': lighten(surface, 0.025),
    card,
    'card-highlight': lighten(card, 0.055),
    field: header,
    line: canvas,
    'line-light': lighten(column, 0.22),
    text,
    muted,
    accent,
    'accent-strong': lighten(accent, 0.3),
    danger: '#f0a5b5',
    scrollbar: lighten(column, 0.23),
    'scrollbar-hover': lighten(column, 0.4)
  }
}

const preset = (id: string, name: string, colors: ThemeColors): PlannerTheme => ({
  id,
  name,
  baseId: id,
  colors
})

export const DEFAULT_THEMES: PlannerTheme[] = [
  preset(
    'blender',
    'Blender',
    palette('#242424', '#303030', '#353535', '#1d1d1d', '#484848', '#eea45b', '#f2f2f2', '#bcbcbc')
  ),
  preset(
    'fl-studio',
    'FL Studio',
    palette('#232a2d', '#2e383c', '#343e42', '#1d2528', '#465157', '#b5d96b', '#f0f4ef', '#b5c3bf')
  ),
  preset(
    'maya',
    'Maya',
    palette('#252d30', '#303d40', '#354448', '#1c272a', '#475c62', '#79c9cc', '#edf5f5', '#b0c6c8')
  ),
  preset(
    'obsidian',
    'Obsidian',
    palette('#1c1b20', '#26232e', '#2d2936', '#17151c', '#3e374e', '#b69cf2')
  ),
  preset(
    'dark-emerald',
    'Dark Emerald',
    palette('#172922', '#20382d', '#294337', '#12241c', '#385746', '#8dd7ac', '#eff8f1', '#adc9b8')
  ),
  preset('space', 'Space', {
    canvas: '#252331',
    header: '#302848',
    'header-highlight': '#393051',
    column: '#353445',
    'column-highlight': '#393749',
    'surface-dark': '#19191d',
    'surface-dark-highlight': '#1e1c23',
    card: '#4c456d',
    'card-highlight': '#554e79',
    field: '#302b47',
    line: '#292732',
    'line-light': '#625d72',
    text: '#f3f1f8',
    muted: '#b6afc8',
    accent: '#a89bd6',
    'accent-strong': '#c7baf2',
    danger: '#f0a5b5',
    scrollbar: '#69617f',
    'scrollbar-hover': '#9185ad'
  }),
  preset(
    'crimson',
    'Crimson',
    palette('#2c1d24', '#402633', '#49303b', '#23171e', '#633e4d', '#eca0b3', '#fcf1f5', '#d0b3bf')
  ),
  preset(
    'dracula',
    'Dracula',
    palette('#21222c', '#282a36', '#303240', '#191a23', '#44475a', '#bd93f9', '#f8f8f2', '#b9bbd0')
  )
]

export function defaultThemeState(): ThemeState {
  return {
    activeId: 'space',
    themes: DEFAULT_THEMES.map((theme) => ({ ...theme, colors: { ...theme.colors } }))
  }
}

export function activeTheme(state?: ThemeState): PlannerTheme {
  return state?.themes.find((theme) => theme.id === state.activeId) ?? DEFAULT_THEMES[5]
}

export function isThemeState(value: unknown): value is ThemeState {
  if (!value || typeof value !== 'object') return false
  const state = value as Partial<ThemeState>
  if (!Array.isArray(state.themes) || state.themes.length < 1 || state.themes.length > 64)
    return false
  const valid = state.themes.every(
    (theme: PlannerTheme) =>
      theme &&
      typeof theme.id === 'string' &&
      /^[a-z0-9-]{1,64}$/.test(theme.id) &&
      typeof theme.name === 'string' &&
      theme.name.trim().length > 0 &&
      theme.name.length <= 64 &&
      DEFAULT_THEMES.some((preset) => preset.id === theme.baseId) &&
      theme.colors &&
      typeof theme.colors === 'object' &&
      Object.keys(theme.colors).length === COLOR_FIELDS.length &&
      COLOR_FIELDS.every(({ key }) => isHexColor(theme.colors[key]))
  )
  return (
    valid &&
    new Set(state.themes.map((theme) => theme.id)).size === state.themes.length &&
    state.themes.some((theme) => theme.id === state.activeId)
  )
}
