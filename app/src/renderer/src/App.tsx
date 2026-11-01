import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties
} from 'react'
import type { AppData, Card } from '../../shared/types'
import { YearBoard } from './components/YearBoard'
import { moveCard } from '../../shared/card-order'
import type { CardFields } from './components/CardForm'
import { SettingsDialog } from './components/SettingsDialog'
import { activeTheme, upgradePresetThemes } from '../../shared/themes'
import { applyTheme } from './applyTheme'
import { readStoredYear } from './year'
import { COLUMN_WIDTH_KEY, readColumnWidth } from './viewPreferences'
import { ViewToolbar } from './components/ViewToolbar'
import { useKeyboardNavigation } from './useKeyboardNavigation'
import { useViewPositionStore } from './useViewPosition'
import { monthTotals } from '../../shared/totals'
import { yearBoardWidth } from '../../shared/window-width'

// A trackpad or wheel gesture sends many events; a pause this long starts a new gesture.
const WHEEL_GESTURE_GAP_MS = 300

function App(): React.JSX.Element {
  useKeyboardNavigation()
  const viewPosition = useViewPositionStore()
  const [columnWidth, setColumnWidth] = useState(() => {
    try {
      return readColumnWidth(localStorage.getItem(COLUMN_WIDTH_KEY))
    } catch {
      return readColumnWidth(null)
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(COLUMN_WIDTH_KEY, String(columnWidth))
    } catch {
      // The view remains usable if the local preference store is unavailable.
    }
    // The window never grows beyond the twelve month columns; a failure only leaves it wider.
    void window.capacityPlanner.setWindowWidthLimit(yearBoardWidth(columnWidth)).catch(() => {})
  }, [columnWidth])
  const [year, setYear] = useState(() => {
    return readStoredYear(
      localStorage.getItem('capacity-planner:selected-year'),
      new Date().getFullYear()
    )
  })
  const wheelGestureAt = useRef(0)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<AppData | null>(null)
  const dataRef = useRef<AppData | null>(null)
  const saveRevision = useRef(0)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const busyRef = useRef(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [importRevision, setImportRevision] = useState(0)
  const [settingsView, setSettingsView] = useState<'themes' | 'data'>('themes')
  const [yearMenuOpen, setYearMenuOpen] = useState(false)

  useLayoutEffect(() => {
    applyTheme(activeTheme(data?.appearance).colors)
  }, [data?.appearance])
  const openSettings = useCallback(
    (view: 'themes' | 'data' = 'themes'): void => {
      if (
        dataRef.current &&
        !busyRef.current &&
        !dragging &&
        !document.querySelector('dialog[open]')
      ) {
        setSettingsView(view)
        setSettingsOpen(true)
      }
    },
    [dragging]
  )
  useEffect(() => {
    localStorage.setItem('capacity-planner:selected-year', String(year))
  }, [year])
  function shiftYear(step: number): void {
    setYear((current) => Math.min(9999, Math.max(1, current + step)))
  }
  useEffect(() => {
    const unsubscribe = window.capacityPlanner.onOpenSettings(() => openSettings('themes'))
    const shortcut = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key === ',') {
        event.preventDefault()
        openSettings('themes')
      }
    }
    document.addEventListener('keydown', shortcut)
    return () => {
      unsubscribe()
      document.removeEventListener('keydown', shortcut)
    }
  }, [openSettings])

  useEffect(() => {
    let active = true
    void window.capacityPlanner
      .loadData()
      .then((loaded) => {
        if (active) {
          const upgraded = loaded.appearance
            ? { ...loaded, appearance: upgradePresetThemes(loaded.appearance) }
            : loaded
          dataRef.current = upgraded
          setData(upgraded)
        }
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : 'Lokale Daten konnten nicht geladen werden.'
          )
      })
    return () => {
      active = false
    }
  }, [])

  function toggleDescription(id: string): void {
    if (busyRef.current) return
    const current = dataRef.current
    if (!current) return
    const next = {
      ...current,
      cards: current.cards.map((card) =>
        card.id === id ? { ...card, expanded: !card.expanded } : card
      )
    }
    dataRef.current = next
    setData(next)
    const revision = ++saveRevision.current
    void window.capacityPlanner
      .saveData(next)
      .then((result) => {
        if (!result.saved) throw new Error('Der Aufklappzustand konnte nicht gespeichert werden.')
        if (revision === saveRevision.current) setError(null)
      })
      .catch(() => {
        if (revision === saveRevision.current)
          setError('Der Aufklappzustand konnte nicht gespeichert werden. Bitte erneut versuchen.')
      })
  }

  async function saveChanges(
    change: Partial<Pick<AppData, 'cards' | 'appearance'>>,
    optimistic = false
  ): Promise<boolean> {
    const current = dataRef.current
    if (!current || busyRef.current) return false
    busyRef.current = true
    setBusy(true)
    const revision = ++saveRevision.current
    const next = { ...current, ...change }
    if (optimistic) {
      dataRef.current = next
      setData(next)
    }
    try {
      const result = await window.capacityPlanner.saveData(next)
      if (!result.saved) throw new Error('Speichern fehlgeschlagen.')
      dataRef.current = next
      setData(next)
      if (revision === saveRevision.current) setError(null)
      return true
    } catch {
      if (optimistic) {
        dataRef.current = current
        setData(current)
      }
      if (revision === saveRevision.current)
        setError('Die Änderung konnte nicht gespeichert werden. Bitte erneut versuchen.')
      return false
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  function saveCards(cards: Card[], optimistic = false): Promise<boolean> {
    return saveChanges({ cards }, optimistic)
  }

  function saveCard(fields: CardFields, month: number, card?: Card): Promise<boolean> {
    const current = dataRef.current
    if (!current) return Promise.resolve(false)
    if (card) {
      return saveCards(
        current.cards.map((existing) =>
          existing.id === card.id ? { ...existing, ...fields } : existing
        )
      )
    }
    const order =
      current.cards
        .filter((existing) => existing.year === year && existing.month === month)
        .reduce((max, existing) => Math.max(max, existing.order), -1) + 1
    const created: Card = { ...fields, id: crypto.randomUUID(), year, month, order, expanded: true }
    return saveCards([...current.cards, created])
  }

  function deleteCard(id: string): Promise<boolean> {
    return saveCards((dataRef.current?.cards ?? []).filter((card) => card.id !== id))
  }

  const yearCards = (data?.cards ?? []).filter((card) => card.year === year)
  const calendarYear = new Date().getFullYear()
  const oldestYear =
    data?.cards.reduce((oldest, card) => Math.min(oldest, card.year), calendarYear) ?? calendarYear
  const firstYear = Math.max(1, Math.min(oldestYear, calendarYear) - 1)
  const lastYear = Math.min(9999, Math.max(calendarYear, year) + 1)
  const yearOptions = Array.from(
    { length: lastYear - firstYear + 1 },
    (_, index) => firstYear + index
  )

  return (
    <main className="app-shell" style={{ '--column-width': `${columnWidth}px` } as CSSProperties}>
      <header
        className="planner-header"
        onContextMenu={(event) => {
          event.preventDefault()
          void window.capacityPlanner.showHeaderMenu()
        }}
      >
        <button
          className="header-control settings-open"
          type="button"
          aria-label="Einstellungen öffnen"
          title="Einstellungen (Ctrl+, für Themes)"
          onClick={() => openSettings('themes')}
          disabled={!data || busy || dragging}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M4 7h10M18 7h2M4 12h2M10 12h10M4 17h10M18 17h2"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle
              cx="16"
              cy="7"
              r="2"
              fill="var(--header)"
              stroke="currentColor"
              strokeWidth="2"
            />
            <circle
              cx="8"
              cy="12"
              r="2"
              fill="var(--header)"
              stroke="currentColor"
              strokeWidth="2"
            />
            <circle
              cx="16"
              cy="17"
              r="2"
              fill="var(--header)"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
        </button>
        <nav className="year-navigation" aria-label="Jahresnavigation">
          <button
            className="header-control year-arrow"
            onClick={() => shiftYear(-1)}
            disabled={year === 1 || busy || dragging}
            aria-label="Vorheriges Jahr"
            title="Vorheriges Jahr"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M10.5 3 4 8l6.5 5Z" />
            </svg>
          </button>
          <div className="year-picker">
            <button
              className="selected-year"
              type="button"
              aria-haspopup="listbox"
              aria-expanded={yearMenuOpen}
              aria-label="Jahr auswählen"
              title="Mausrad: Jahr wechseln"
              onClick={() => setYearMenuOpen((open) => !open)}
              onWheel={(event) => {
                const gestureStart = event.timeStamp - wheelGestureAt.current > WHEEL_GESTURE_GAP_MS
                wheelGestureAt.current = event.timeStamp
                if (!gestureStart || event.deltaY === 0 || busy || dragging) return
                shiftYear(Math.sign(event.deltaY))
              }}
            >
              {year}
            </button>
            {yearMenuOpen && (
              <div className="year-menu" role="listbox" aria-label="Jahre">
                {yearOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="option"
                    aria-selected={option === year}
                    className={option === year ? 'is-selected' : undefined}
                    onClick={() => {
                      setYear(option)
                      setYearMenuOpen(false)
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            className="header-control year-arrow"
            onClick={() => shiftYear(1)}
            disabled={year === 9999 || busy || dragging}
            aria-label="Nächstes Jahr"
            title="Nächstes Jahr"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="m5.5 3 6.5 5-6.5 5Z" />
            </svg>
          </button>
        </nav>
        <div className="window-controls" aria-label="Fenstersteuerung">
          <button
            className="header-control"
            type="button"
            onClick={() => void window.capacityPlanner.minimizeWindow()}
            aria-label="Minimieren"
            title="Minimieren"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 11.5h10" />
            </svg>
          </button>
          <button
            className="header-control"
            type="button"
            onClick={() => void window.capacityPlanner.toggleMaximizeWindow()}
            aria-label="Maximieren"
            title="Maximieren"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <rect x="3.5" y="3.5" width="9" height="9" />
            </svg>
          </button>
          <button
            className="header-control"
            type="button"
            onClick={() => void window.capacityPlanner.toggleFullscreen()}
            aria-label="Vollbild umschalten"
            title="Vollbild umschalten"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 6V3h3M10 3h3v3M13 10v3h-3M6 13H3v-3" />
            </svg>
          </button>
          <button
            className="header-control window-close"
            type="button"
            onClick={() => void window.capacityPlanner.closeApp()}
            aria-label="App schließen"
            title="App schließen"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="m4 4 8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      </header>
      {error && (
        <div className="load-error" role="alert">
          {error}
        </div>
      )}
      <YearBoard
        key={`${year}:${importRevision}`}
        year={year}
        cards={yearCards}
        busy={busy}
        ready={data !== null}
        viewPosition={viewPosition}
        onDraggingChange={setDragging}
        onToggle={toggleDescription}
        onSave={saveCard}
        onDelete={deleteCard}
        onMove={(id, month, index) => {
          const current = dataRef.current
          if (!current || busyRef.current) return
          const cards = moveCard(current.cards, year, id, month, index)
          if (cards !== current.cards) void saveCards(cards, true)
        }}
      />
      <ViewToolbar
        year={year}
        revenue={monthTotals(yearCards).revenue}
        width={columnWidth}
        onChange={setColumnWidth}
        disabled={dragging}
      />
      {settingsOpen && (
        <SettingsDialog
          initialView={settingsView}
          initialTheme={data?.appearance}
          busy={busy}
          onImported={(loaded) => {
            setImportRevision((revision) => revision + 1)
            ++saveRevision.current
            dataRef.current = loaded
            setData(loaded)
            setError(null)
          }}
          onSaveTheme={(appearance) => saveChanges({ appearance })}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </main>
  )
}

export default App
