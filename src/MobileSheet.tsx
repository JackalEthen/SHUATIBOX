import { useEffect, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  header?: ReactNode;
  closable?: boolean;
}

export function MobileSheet({ open, onClose, children, header, closable = true }: Props) {
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
    <div className="sheet open" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div className={`sheet-card${header ? ' sheet-fixed' : ''}`}>
        {header ? <div className="sheet-header">{header}</div> : null}
        <div className={header ? 'sheet-body' : undefined}>{children}</div>
      </div>
    </div>
  );
}
