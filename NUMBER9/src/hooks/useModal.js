import { useEffect, useRef, useCallback } from 'react';

/**
 * useModal — robust modal behaviour:
 *   • body scroll lock
 *   • Escape to close
 *   • focus trap (first focusable element auto-focused)
 *   • click-outside to close
 *   • restore focus on unmount
 */
export function useModal({ open, onClose, containerRef }) {
  const prevActiveElement = useRef(null);
  const mouseDownTarget = useRef(null);

  // 1. Body scroll lock
  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = originalOverflow; };
  }, [open]);

  // 2. Escape key
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // 3. Focus trap + auto-focus
  useEffect(() => {
    if (!open) return;
    prevActiveElement.current = document.activeElement;

    const container = containerRef?.current;
    if (!container) return;

    const focusables = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    // Auto-focus first element (preferably the primary action or close button)
    const toFocus = container.querySelector('[data-autofocus]') || first;
    toFocus?.focus();

    const onTab = (e) => {
      if (e.key !== 'Tab') return;
      if (focusables.length === 0) { e.preventDefault(); return; }
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onTab);
    return () => {
      document.removeEventListener('keydown', onTab);
      prevActiveElement.current?.focus?.();
    };
  }, [open, containerRef]);

  // 4. Click outside (only if mousedown AND mouseup both outside)
  const onMouseDown = useCallback((e) => {
    mouseDownTarget.current = e.target;
  }, []);

  const onClick = useCallback((e) => {
    if (e.target === e.currentTarget && mouseDownTarget.current === e.currentTarget) {
      onClose?.();
    }
  }, [onClose]);

  return { onMouseDown, onClick };
}
