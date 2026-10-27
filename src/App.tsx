import { useEffect, useState } from 'react';
import { DesktopApp } from './DesktopApp';
import { MobileApp } from './MobileApp';
import { useAppearance } from './theme';

export default function App() {
  const appearance = useAppearance();
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const update = () => setDesktop(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 2200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const onNotice = (message: string) => {
    setNotice('');
    window.setTimeout(() => setNotice(message), 0);
  };

  return (
    <>
      {desktop ? <DesktopApp appearance={appearance} onNotice={onNotice} /> : <MobileApp appearance={appearance} onNotice={onNotice} />}
      {notice ? (
        <div className="toast-wrap">
          <div className="toast">{notice}</div>
        </div>
      ) : null}
    </>
  );
}

