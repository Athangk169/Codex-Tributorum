import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './styles/GlobalStyles.css';
import App from './App.jsx';
import BiometricGate from './components/layout/BiometricGate.jsx';

// One-shot migration: the old `mech_auth_token` key stored base64(user:pass)
// in localStorage. Sessions upgraded after this build should not retain it.
// This runs once on every load; if the key is missing it's a no-op.
try { localStorage.removeItem('mech_auth_token'); } catch (_) {}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BiometricGate>
      <App />
    </BiometricGate>
  </StrictMode>
);

// ── Service Worker ──
// Registered once here. Do not register in App.jsx.
// On update, dispatch `codex-sw-update` so SwUpdateBanner can prompt a reload.
//
// Skip in dev: Vite serves modules from /@react-refresh, /@vite/client, /src/*,
// none of which exist in the SW's cache list. With the SW active in dev, the
// cache-then-fetch fallback in sw.js was failing on HMR endpoints and spamming
// uncaught rejections. Production builds register normally.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('◈ OFFLINE LINK ESTABLISHED', reg);
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            // Only treat as "update" if there was already a controller — first
            // install isn't a notification-worthy event.
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              window.dispatchEvent(new CustomEvent('codex-sw-update'));
            }
          });
        });
      })
      .catch(err => console.error('◈ OFFLINE LINK FAILED', err));
  });
} else if ('serviceWorker' in navigator && import.meta.env.DEV) {
  // Self-heal: if a previous prod build's SW is still registered on this
  // origin (e.g. dev server running on the same port we previewed on), kill
  // it so it stops intercepting /@react-refresh and friends.
  navigator.serviceWorker.getRegistrations()
    .then(regs => regs.forEach(r => r.unregister()))
    .catch(() => {});
}