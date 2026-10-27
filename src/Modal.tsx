import { useEffect, type ReactNode } from 'react';
import { Icon } from './icons';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export function Modal({ open, title, onClose, children, footer, wide }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal open" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card" style={wide ? { width: 'min(760px,100%)' } : undefined}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--line)]">
          <h2 className="text-[14px] font-semibold">{title}</h2>
          <button className="icon-btn ml-auto" onClick={onClose} aria-label="关闭">
            <Icon name="x" />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer ? <div className="px-5 py-4 border-t border-[var(--line)] flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}
