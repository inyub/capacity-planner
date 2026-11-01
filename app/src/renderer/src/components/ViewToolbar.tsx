import type { Currency } from '../../../shared/types'
import { formatRange } from '../../../shared/totals'
import {
  DEFAULT_COLUMN_WIDTH,
  DEFAULT_UI_SCALE,
  MAX_COLUMN_WIDTH,
  MAX_UI_SCALE,
  MIN_COLUMN_WIDTH,
  MIN_UI_SCALE,
  UI_SCALE_STEP
} from '../viewPreferences'

export function ViewToolbar({
  year,
  revenue,
  revenueHidden,
  onRevenueHiddenChange,
  width,
  scale,
  disabled,
  onChange,
  onScaleChange
}: {
  year: number
  revenue: Partial<Record<Currency, [number, number]>>
  revenueHidden: boolean
  onRevenueHiddenChange: (hidden: boolean) => void
  width: number
  scale: number
  disabled: boolean
  onChange: (width: number) => void
  onScaleChange: (scale: number) => void
}): React.JSX.Element {
  const hasRevenue = Object.keys(revenue).length > 0
  return (
    <footer className="view-toolbar" aria-label="Ansichtseinstellungen">
      <div
        className="year-revenue"
        aria-label={`Erwarteter Jahresumsatz ${year}`}
        onClick={(event) => {
          if (!(event.target as Element).closest('button')) onRevenueHiddenChange(!revenueHidden)
        }}
      >
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
        <button
          type="button"
          className="view-reset revenue-toggle"
          aria-pressed={revenueHidden}
          aria-label="Umsatzzahlen verbergen"
          title={revenueHidden ? 'Umsatzzahlen einblenden' : 'Umsatzzahlen verbergen'}
          onClick={() => onRevenueHiddenChange(!revenueHidden)}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
            <circle cx="8" cy="8" r="2" />
            {revenueHidden && <path d="M2.5 13.5 13.5 2.5" />}
          </svg>
        </button>
      </div>
      {/* Each icon is the reset button of its slider. */}
      <div className="view-slider">
        <button
          type="button"
          className="view-reset"
          disabled={disabled}
          aria-label="Spaltenbreite zurücksetzen"
          title={`Spaltenbreite – Klick: zurück auf ${DEFAULT_COLUMN_WIDTH} px`}
          onClick={() => onChange(DEFAULT_COLUMN_WIDTH)}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2 3v10M14 3v10M4.5 8h7M6.5 6 4.5 8l2 2M9.5 6l2 2-2 2" />
          </svg>
        </button>
        <input
          id="column-width"
          type="range"
          min={MIN_COLUMN_WIDTH}
          max={MAX_COLUMN_WIDTH}
          step={1}
          value={width}
          aria-label="Spaltenbreite"
          aria-valuetext={`${width} Pixel`}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <output htmlFor="column-width">{width} px</output>
      </div>
      <div className="view-slider">
        <button
          type="button"
          className="view-reset"
          aria-label="UI-Skalierung zurücksetzen"
          title={`UI-Skalierung – Klick: zurück auf ${DEFAULT_UI_SCALE} %`}
          onClick={() => onScaleChange(DEFAULT_UI_SCALE)}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M1.5 13 4.5 6l3 7M2.6 10.5h3.8M8.5 13l3-9 3 9M9.6 10h3.8" />
          </svg>
        </button>
        <input
          id="ui-scale"
          type="range"
          min={MIN_UI_SCALE}
          max={MAX_UI_SCALE}
          step={UI_SCALE_STEP}
          value={scale}
          aria-label="UI-Skalierung"
          aria-valuetext={`${scale} Prozent`}
          onChange={(event) => onScaleChange(Number(event.target.value))}
        />
        <output htmlFor="ui-scale">{scale} %</output>
      </div>
    </footer>
  )
}
