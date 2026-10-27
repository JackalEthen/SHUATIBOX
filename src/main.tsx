import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/mockup.css';

if (/android|iphone|ipad|mobile/i.test(navigator.userAgent)) {
  document.documentElement.classList.add('native');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
