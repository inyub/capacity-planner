import type { ThemeColors } from '../../shared/types'
import { COLOR_FIELDS, isHexColor } from '../../shared/themes'

export function applyTheme(colors: ThemeColors): void {
  for (const { key } of COLOR_FIELDS) {
    if (isHexColor(colors[key])) document.documentElement.style.setProperty(`--${key}`, colors[key])
  }
}
