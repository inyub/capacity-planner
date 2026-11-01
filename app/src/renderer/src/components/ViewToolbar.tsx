import type { Currency } from '../../../shared/types'
import { formatRange } from '../../../shared/totals'
import { DEFAULT_COLUMN_WIDTH, MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH } from '../viewPreferences'

export function ViewToolbar({
  year,
  revenue,
  width,
  disabled,
  onChange
}: {
  year: number
  revenue: Partial<Record<Currency, [number, number]>>
  width: number
  disabled: boolean
  onChange: (width: number) => void
}): React.JSX.Element {
  const hasRevenue = Object.keys(revenue).length > 0
  return (
    <footer className="view-toolbar" aria-label="Ansichtseinstellungen">
      <div className="year-revenue" aria-label={`Erwarteter Jahresumsatz ${year}`}>
        <span className="year-revenue-label">Erwarteter Jahresumsatz {year}</span>
        {hasRevenue ? (
          (['CHF', 'EUR'] as const).map((currency) => {
            const range = revenue[currency]
            return range ? (
              <span key={currency}>
                {formatRange(...range)} {currency}
              </span>
            ) : null
          })
        ) : (
          <span>–</span>
        )}
      </div>
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
