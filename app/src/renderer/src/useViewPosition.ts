import { useEffect, useState } from 'react'
import { readViewPosition, VIEW_POSITION_KEY, type ViewPosition } from './viewPreferences'

export interface ViewPositionStore {
  read: () => ViewPosition
  setBoardLeft: (left: number) => void
  setColumnTop: (month: number, top: number) => void
  setFocusedCard: (id: string) => void
  flush: () => void
}

function readStored(): ViewPosition {
  try {
    return readViewPosition(localStorage.getItem(VIEW_POSITION_KEY))
  } catch {
    return readViewPosition(null)
  }
}

function writeStored(position: ViewPosition): void {
  try {
    localStorage.setItem(VIEW_POSITION_KEY, JSON.stringify(position))
  } catch {
    // The position is a convenience; the planner keeps working without it.
  }
}

function createViewPositionStore(): ViewPositionStore {
  let current = readStored()
  let timer: number | undefined
  const flush = (): void => {
    window.clearTimeout(timer)
    writeStored(current)
  }
  // Scroll events arrive in bursts, so the position is kept in memory and written once it settles.
  const update = (change: Partial<ViewPosition>): void => {
    current = { ...current, ...change }
    window.clearTimeout(timer)
    timer = window.setTimeout(() => writeStored(current), 300)
  }
  return {
    read: () => current,
    setBoardLeft: (boardLeft) => update({ boardLeft }),
    setColumnTop: (month, top) => {
      const columnTops = [...current.columnTops]
      columnTops[month] = top
      update({ columnTops })
    },
    setFocusedCard: (focusedCardId) => update({ focusedCardId }),
    flush
  }
}

export function useViewPositionStore(): ViewPositionStore {
  const [store] = useState(createViewPositionStore)
  useEffect(() => () => store.flush(), [store])
  return store
}
