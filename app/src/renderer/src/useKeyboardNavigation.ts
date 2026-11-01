import { useEffect } from 'react'

export function useKeyboardNavigation(): void {
  useEffect(() => {
    const root = document.documentElement
    const pointer = (): void => {
      delete root.dataset.keyboardNavigation
    }
    const keyboard = (event: KeyboardEvent): void => {
      if (!event.isComposing && !['Shift', 'Control', 'Alt', 'Meta'].includes(event.key))
        root.dataset.keyboardNavigation = 'true'
    }
    document.addEventListener('keydown', keyboard, true)
    document.addEventListener('pointerdown', pointer, true)
    document.addEventListener('pointermove', pointer, true)
    return () => {
      document.removeEventListener('keydown', keyboard, true)
      document.removeEventListener('pointerdown', pointer, true)
      document.removeEventListener('pointermove', pointer, true)
      pointer()
    }
  }, [])
}
