import { useEffect, type ReactNode } from 'react';
import { Icon } from './icons';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  closable?: boolean;
}

export function Modal({ open, title, onClose, children, footer, wide, closable = true }: Props) {
  useEffect(() => {
    if (!open || !closable) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, closable]);

  if (!open) return null;
  const close = () => {
    if (closable) onClose();
  };
  return (
    <div className="modal open" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div className="modal-card" style={wide ? { width: 'min(760px,100%)' } : undefined}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--line)]">
          <h2 className="text-[14px] font-semibold">{title}</h2>
          <button className="icon-btn ml-auto" onClick={close} aria-label="关闭" disabled={!closable}>
            <Icon name="x" />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer ? <div className="px-5 py-4 border-t border-[var(--line)] flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}
