import { useLayoutEffect, useRef, useState } from 'react'
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import type { Card } from '../../../shared/types'
import type { CardFields } from './CardForm'
import { MonthColumn } from './MonthColumn'
import { PlannerCard } from './PlannerCard'
import { useBoardAutoScroll } from '../useBoardAutoScroll'
import { cardWeek, groupByWeek, monthWeeks } from '../../../shared/weeks'
import type { ViewPositionStore } from '../useViewPosition'

const MONTHS = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember'
]

// Hit-test the visible list first, so offscreen cards, headings and footers never steal a drop.
const monthCollision: CollisionDetection = (args) => {
  if (!args.pointerCoordinates) return closestCenter(args)
  const columns = args.droppableContainers.filter(
    (container) => container.data.current?.type === 'month'
  )
  const bounds = columns[0]?.node.current?.closest('.year-board')?.getBoundingClientRect()
  const point = args.pointerCoordinates
  if (
    !bounds ||
    point.x < bounds.left ||
    point.x > bounds.right ||
    point.y < bounds.top ||
    point.y > bounds.bottom
  )
    return []
  const hit = pointerWithin({ ...args, droppableContainers: columns })[0]
  if (!hit) return []
  const month = args.droppableContainers.find((container) => container.id === hit.id)?.data.current
    ?.month
  const weeks = args.droppableContainers.filter(
    (container) =>
      container.data.current?.type === 'week' && container.data.current?.month === month
  )
  // With week grouping the week under the pointer (or the nearest one) is the target list.
  const week = weeks.length
    ? (pointerWithin({ ...args, droppableContainers: weeks })[0] ??
      closestCenter({ ...args, droppableContainers: weeks })[0])
    : undefined
  const weekKey = week
    ? args.droppableContainers.find((container) => container.id === week.id)?.data.current?.week
    : undefined
  const items = args.droppableContainers.filter(
    (container) =>
      container.data.current?.type === 'card' &&
      container.data.current?.month === month &&
      (!week || container.data.current?.week === weekKey)
  )
  // Blank space after the last card is an explicit append target.
  const belowAll = items.every((item) => {
    const rect = args.droppableRects.get(item.id)
    return !rect || point.y > rect.bottom
  })
  return items.length && !belowAll
    ? closestCenter({ ...args, droppableContainers: items })
    : [week ?? hit]
}

export function YearBoard({
  year,
  cards,
  busy,
  ready,
  viewPosition,
  onDraggingChange,
  onToggle,
  onSave,
  onDelete,
  onMove,
  weekGrouping
}: {
  year: number
  cards: Card[]
  busy: boolean
  ready: boolean
  viewPosition: ViewPositionStore
  onDraggingChange: (dragging: boolean) => void
  onToggle: (id: string) => void
  onSave: (fields: CardFields, month: number, card?: Card, week?: number) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
  onMove: (id: string, month: number, index: number, week?: number | null) => void
  weekGrouping: boolean
}): React.JSX.Element {
  const board = useRef<HTMLDivElement>(null)
  // Runs once the cards exist, because a scroll position cannot be restored into empty columns.
  useLayoutEffect(() => {
    const element = board.current
    if (!ready || !element) return
    const saved = viewPosition.read()
    element.scrollLeft = saved.boardLeft
    element.querySelectorAll<HTMLElement>('.month-cards').forEach((list) => {
      list.scrollTop = saved.columnTops[Number(list.dataset.month)] ?? 0
    })
    const focused = Array.from(element.querySelectorAll<HTMLElement>('[data-card-id]')).find(
      (card) => card.dataset.cardId === saved.focusedCardId
    )
    // A card that no longer exists leaves focus at the default start of the view.
    focused?.closest<HTMLElement>('.sortable-card')?.focus({ preventScroll: true })
  }, [ready, viewPosition])
  const [active, setActive] = useState<Card | null>(null)
  const pointerRef = useBoardAutoScroll(board, active !== null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  function stop(): void {
    setActive(null)
    onDraggingChange(false)
  }
  function drop({ active: dragged, over }: DragEndEvent): void {
    stop()
    if (!over || busy || !active || active.year !== year) return
    const month = over.data.current?.month as number | undefined
    if (month === undefined) return
    const monthCards = cards.filter((card) => card.month === month)
    let week: number | null | undefined
    let destination: Card[]
    let sameList = month === active.month
    if (weekGrouping) {
      const weeks = monthWeeks(year, month)
      // A drop on the month itself (no week hit) appends to the last week of the month.
      week =
        over.data.current?.type === 'month'
          ? weeks[weeks.length - 1].week
          : (over.data.current?.week as number | null)
      destination = groupByWeek(monthCards, weeks).find((group) => group.week === week)!.cards
      sameList &&= cardWeek(active, weeks) === week
    } else {
      destination = monthCards.sort((a, b) => a.order - b.order)
    }
    const targetIndex = destination.findIndex((card) => card.id === over.id)
    let index = targetIndex < 0 ? destination.length : targetIndex
    if (!sameList && targetIndex >= 0) {
      const y = pointerRef.current?.y ?? over.rect.top
      if (y > over.rect.top + over.rect.height / 2) index++
    }
    onMove(String(dragged.id), month, index, week)
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={monthCollision}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      autoScroll={false}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            'Leertaste zum Aufnehmen. Pfeiltasten zum Verschieben, Leertaste zum Ablegen, Escape zum Abbrechen.'
        },
        announcements: {
          onDragStart: () => 'Karte aufgenommen.',
          onDragOver: ({ over }) =>
            over
              ? `Ziel: ${MONTHS[over.data.current?.month]}${
                  typeof over.data.current?.week === 'number'
                    ? `, KW ${over.data.current.week}`
                    : ''
                }.`
              : 'Außerhalb der Monatslisten.',
          onDragEnd: ({ over }) => (over ? 'Karte abgelegt.' : 'Verschieben abgebrochen.'),
          onDragCancel: () => 'Verschieben abgebrochen.'
        }
      }}
      onDragStart={({ active, activatorEvent }) => {
        const card = cards.find((card) => card.id === active.id)
        if (!card || busy) return
        if ('clientX' in activatorEvent && 'clientY' in activatorEvent)
          pointerRef.current = {
            x: Number(activatorEvent.clientX),
            y: Number(activatorEvent.clientY)
          }
        setActive(card)
        onDraggingChange(true)
      }}
      onDragCancel={stop}
      onDragEnd={drop}
    >
      <div
        ref={board}
        className={`year-board${active ? ' is-dragging' : ''}`}
        role="region"
        aria-label={`Monatsübersicht ${year}`}
        tabIndex={0}
        onScroll={(event) => viewPosition.setBoardLeft(event.currentTarget.scrollLeft)}
        onFocus={(event) => {
          const card = (event.target as HTMLElement)
            .closest('.sortable-card')
            ?.querySelector<HTMLElement>('[data-card-id]')
          if (card?.dataset.cardId) viewPosition.setFocusedCard(card.dataset.cardId)
        }}
      >
        {MONTHS.map((month, index) => (
          <MonthColumn
            key={month}
            month={month}
            monthIndex={index}
            year={year}
            cards={cards.filter((card) => card.month === index).sort((a, b) => a.order - b.order)}
            onToggle={onToggle}
            busy={busy}
            dragging={active !== null}
            ready={ready}
            onSave={(fields, card, week) => onSave(fields, index, card, week)}
            onDelete={onDelete}
            onScrollTop={(top) => viewPosition.setColumnTop(index, top)}
            weekGrouping={weekGrouping}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {active ? (
          <div className="card-drag-overlay" aria-hidden="true">
            <PlannerCard card={active} disabled onEdit={() => {}} onToggle={() => {}} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
