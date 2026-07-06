const IMPORT_SUCCESS_TEXT = 'を取り込みました。ホームからすぐに始められます。';
let pendingImport = null;
let startTriggered = false;
let toastTimer = 0;

function injectStyles() {
  if (document.getElementById('quiz-flow-patch-style')) return;
  const style = document.createElement('style');
  style.id = 'quiz-flow-patch-style';
  style.textContent = `
    .detail-toggle-button { display: none !important; }
    .answer-details { display: block !important; }
    .app-import-success-toast {
      position: fixed; z-index: 1000; left: 16px; right: 16px;
      bottom: calc(88px + env(safe-area-inset-bottom)); max-width: 600px; margin: 0 auto;
      display: flex; gap: 10px; align-items: flex-start; padding: 12px 13px;
      border: 1px solid rgba(61,184,108,.52); border-radius: 15px;
      background: rgba(21, 49, 34, .97); color: #e8fff0;
      box-shadow: 0 16px 36px rgba(0,0,0,.34); animation: appImportToast .24s ease both;
    }
    .app-import-success-toast > span { display: grid; place-items: center; width: 22px; height: 22px; flex: 0 0 auto; border-radius: 50%; background: rgba(86,218,133,.22); color: #baf7cb; font-weight: 900; }
    .app-import-success-toast strong, .app-import-success-toast small { display:block; }
    .app-import-success-toast strong { font-size: 13px; }
    .app-import-success-toast small { color: #c9ecd4; font-size: 11px; line-height: 1.55; margin-top: 2px; }
    @keyframes appImportToast { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  `;
  document.head.appendChild(style);
}

function expandAnswerDetails() {
  document.querySelectorAll('button.detail-toggle-button[aria-expanded="false"]').forEach((button) => {
    if (button.dataset.autoExpanded === 'true') return;
    button.dataset.autoExpanded = 'true';
    button.click();
  });
}

function renameImportButton() {
  document.querySelectorAll('.import-footer .primary-button').forEach((button) => {
    const label = (button.textContent || '').trim();
    if (label === 'このセットを取り込む') button.textContent = '取り込んで、すぐ始める';
  });
}

function showImportToast(title, count) {
  document.querySelector('.app-import-success-toast')?.remove();
  window.clearTimeout(toastTimer);
  const toast = document.createElement('div');
  toast.className = 'app-import-success-toast';
  toast.setAttribute('role', 'status');
  toast.innerHTML = `<span>✓</span><div><strong>取り込み完了。クイズを開始しました</strong><small>「${title || '問題セット'}」${count ? `｜${count}問` : ''}</small></div>`;
  document.body.appendChild(toast);
  toastTimer = window.setTimeout(() => toast.remove(), 4200);
}

function detectSuccessfulImport() {
  if (pendingImport) return;
  const message = [...document.querySelectorAll('.notice-message')]
    .map((node) => node.textContent || '')
    .find((text) => text.includes(IMPORT_SUCCESS_TEXT));
  if (!message) return;

  const match = message.match(/「(.+?)」/);
  pendingImport = { title: match ? match[1] : '', detectedAt: Date.now() };
  startTriggered = false;

  const homeButton = [...document.querySelectorAll('.bottom-nav button')]
    .find((button) => (button.textContent || '').includes('ホーム'));
  homeButton?.click();
}

function startImportedQuiz() {
  if (!pendingImport || startTriggered) return;

  const cards = [...document.querySelectorAll('.set-card')];
  const matchingCard = cards.find((card) => {
    const title = card.querySelector('h3')?.textContent?.trim() || '';
    return pendingImport.title && title === pendingImport.title;
  });

  const startButton = matchingCard?.querySelector('.primary-button');
  if (!startButton) return;

  startTriggered = true;
  const countText = matchingCard.querySelector('.set-balance')?.textContent || '';
  const countMatch = countText.match(/ニュース\s*(\d+)/);
  const count = countMatch ? Number(countMatch[1]) : null;
  showImportToast(pendingImport.title, count);
  startButton.click();
  pendingImport = null;
}

let queued = false;
function applyPatch() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    injectStyles();
    renameImportButton();
    expandAnswerDetails();
    detectSuccessfulImport();
    startImportedQuiz();
  });
}

new MutationObserver(applyPatch).observe(document.documentElement, { childList: true, subtree: true });
window.setInterval(applyPatch, 300);
applyPatch();
