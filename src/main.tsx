import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './uiux-overrides.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // PWA registration is optional. The app remains fully usable without it.
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
