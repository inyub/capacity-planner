import { DEFAULT_COLUMN_WIDTH, MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH } from '../viewPreferences'

export function ViewToolbar({
  width,
  disabled,
  onChange
}: {
  width: number
  disabled: boolean
  onChange: (width: number) => void
}): React.JSX.Element {
  return (
    <footer className="view-toolbar" aria-label="Ansichtseinstellungen">
      <label htmlFor="column-width">Spaltenbreite</label>
      <input
        id="column-width"
        type="range"
        min={MIN_COLUMN_WIDTH}
        max={MAX_COLUMN_WIDTH}
        step={1}
        value={width}
        aria-valuetext={`${width} Pixel`}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output htmlFor="column-width">{width} px</output>
      <button
        type="button"
        disabled={disabled || width === DEFAULT_COLUMN_WIDTH}
        aria-label="Spaltenbreite zurücksetzen"
        onClick={() => onChange(DEFAULT_COLUMN_WIDTH)}
      >
        Zurücksetzen
      </button>
    </footer>
  )
}
