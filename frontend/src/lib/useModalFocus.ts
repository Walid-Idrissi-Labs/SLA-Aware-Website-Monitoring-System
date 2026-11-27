import { useEffect, useRef, type RefObject } from 'react'

const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** For a modal: Tab and Shift+Tab wrap inside it, and closing it gives focus back to
 *  whatever had it before it opened (usually the button that opened it). */
export function useModalFocus(ref: RefObject<HTMLElement | null>) {
  // Read during render: an autoFocus field inside the modal takes focus before any effect runs.
  const opener = useRef(document.activeElement as HTMLElement | null)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    // Skip hidden controls: no offsetParent, or inside an aria-hidden part (a step pane on its way out).
    const tabbables = () =>
      [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) => el.offsetParent !== null && !el.closest('[aria-hidden="true"]'))
    if (!root.contains(document.activeElement)) tabbables()[0]?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = tabbables()
      if (items.length === 0) return
      const inside = root.contains(document.activeElement)
      if (e.shiftKey && (!inside || document.activeElement === items[0])) {
        e.preventDefault()
        items[items.length - 1].focus()
      } else if (!e.shiftKey && (!inside || document.activeElement === items[items.length - 1])) {
        e.preventDefault()
        items[0].focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const back = opener.current
    return () => {
      document.removeEventListener('keydown', onKey)
      back?.focus?.()
    }
  }, [ref])
}
