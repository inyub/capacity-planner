// The year board shows twelve month columns; a column's border sits inside its width.
const MONTHS_PER_YEAR = 12
// The app shell has a one-pixel border on each side.
const SHELL_BORDER_WIDTH = 2

export function yearBoardWidth(columnWidth: number): number {
  return MONTHS_PER_YEAR * columnWidth + SHELL_BORDER_WIDTH
}
