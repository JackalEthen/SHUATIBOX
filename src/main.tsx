import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initLang } from './i18n';
import './styles/mockup.css';

if (/android|iphone|ipad|mobile/i.test(navigator.userAgent)) {
  document.documentElement.classList.add('native');
}

initLang().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
