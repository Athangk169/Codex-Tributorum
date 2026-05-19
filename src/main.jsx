import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './styles/GlobalStyles.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// ── Service Worker ──
// Registered once here. Do not register in App.jsx.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg  => console.log('◈ OFFLINE LINK ESTABLISHED', reg))
      .catch(err => console.error('◈ OFFLINE LINK FAILED', err));
  });
}