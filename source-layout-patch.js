function injectSourceLayoutStyles() {
  if (document.getElementById('source-layout-patch-style')) return;
  const style = document.createElement('style');
  style.id = 'source-layout-patch-style';
  style.textContent = `
    .source-section,
    .source-section .source-list {
      min-width: 0 !important;
      max-width: 100% !important;
    }

    .source-section .source-list {
      display: grid !important;
      gap: 8px !important;
    }

    .source-section .source-list a,
    .source-list a {
      display: block !important;
      max-width: 100% !important;
      min-width: 0 !important;
      box-sizing: border-box !important;
      padding: 10px 11px !important;
      border: 1px solid rgba(255,255,255,.1) !important;
      border-radius: 11px !important;
      background: rgba(255,255,255,.035) !important;
      color: #aebeed !important;
      text-decoration: none !important;
      font-size: 12px !important;
      line-height: 1.55 !important;
      white-space: normal !important;
      overflow-wrap: anywhere !important;
      word-break: break-word !important;
    }

    .source-section .source-list a strong,
    .source-list a strong {
      overflow-wrap: anywhere !important;
      word-break: break-word !important;
    }
  `;
  document.head.appendChild(style);
}

injectSourceLayoutStyles();
