import { useSortable } from '@dnd-kit/sortable'
import type { Card } from '../../../shared/types'
import { PlannerCard } from './PlannerCard'

export function SortableCard({
  card,
  week,
  disabled,
  dragDisabled,
  onEdit,
  onToggle
}: {
  card: Card
  /** Week group the card is shown in; undefined without week grouping. */
  week?: number | null
  disabled: boolean
  dragDisabled: boolean
  onEdit: () => void
  onToggle: (id: string) => void
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } =
    useSortable({
      id: card.id,
      data: { type: 'card', month: card.month, week },
      disabled: dragDisabled
    })
  return (
    <div
      ref={setNodeRef}
      className={`sortable-card${isDragging ? ' is-dragging' : ''}${isOver ? ' is-over' : ''}`}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition
      }}
      {...attributes}
      {...listeners}
      aria-label={`${card.title} verschieben`}
      aria-roledescription="Verschiebbare Karte"
      onPointerDown={(event) => {
        // Buttons keep their existing click/focus behaviour and never activate a drag.
        if ((event.target as HTMLElement).closest('button, input, textarea, select, a')) return
        listeners?.onPointerDown?.(event)
      }}
      onDoubleClick={(event) => {
        // Double-click opens the editor like the gear, but never from the card's own buttons.
        if (disabled || (event.target as HTMLElement).closest('button')) return
        onEdit()
      }}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget) listeners?.onKeyDown?.(event)
      }}
    >
      <PlannerCard card={card} disabled={disabled} onEdit={onEdit} onToggle={onToggle} />
    </div>
  )
}
