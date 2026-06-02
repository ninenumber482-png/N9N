import { useRef } from 'react';
import { useModal } from '../../hooks/useModal';

/**
 * ModalOverlay — reusable accessible modal wrapper for inline modals.
 * Provides: body scroll lock, Escape close, focus trap, click-outside, focus restore.
 */
export default function ModalOverlay({ open, onClose, children, className = '' }) {
  const containerRef = useRef(null);
  const modal = useModal({ open, onClose, containerRef });

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 z-50 flex items-center justify-center ${className}`}
      role="dialog"
      aria-modal="true"
      onMouseDown={modal.onMouseDown}
      onClick={modal.onClick}
    >
      <div onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
