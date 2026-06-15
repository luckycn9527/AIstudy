import { ReactNode, useEffect } from 'react';

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

/** Reusable modal dialog with overlay, ESC-to-close, and focus management */
export function Dialog({ open, title, onClose, children, footer, width = 420 }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div
        className="dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width: `${width}px`, maxWidth: '90vw' }}
      >
        <h3 className="dialog-title">{title}</h3>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-actions">{footer}</div>}
      </div>
    </div>
  );
}
