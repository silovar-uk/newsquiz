const CLEANUP_DB_NAME = 'news-context-quiz-db';
const CLEANUP_QUIZ_STORE = 'quizSets';
const CLEANUP_ATTEMPT_STORE = 'attempts';
let cleanupQueued = false;
let cleanupSetId = '';

function injectCleanupStyles() {
  if (document.getElementById('set-cleanup-patch-style')) return;
  const style = document.createElement('style');
  style.id = 'set-cleanup-patch-style';
  style.textContent = `
    .set-card-actions .icon-button.visible-delete-button { width: auto !important; min-width: 104px; padding: 0 12px !important; font-size: 12px !important; font-weight: 700; }
    .app-result-cleanup-card { margin: 20px 0; padding: 18px; border: 1px solid rgba(255,255,255,.12); border-radius: 18px; background: rgba(255,255,255,.035); }
    .app-result-cleanup-card h2 { margin: 4px 0 8px; font-size: 18px; }
    .app-result-cleanup-card p { margin: 0 0 14px; color: #b7bfce; font-size: 13px; line-height: 1.7; }
    .app-result-cleanup-card button { width: 100%; min-height: 44px; border: 1px solid rgba(255,122,122,.45); border-radius: 12px; background: rgba(186,50,50,.14); color: #ffd6d6; font: inherit; font-weight: 700; cursor: pointer; }
    .app-result-cleanup-card button:disabled { opacity: .55; cursor: wait; }
    .app-cleanup-feedback { display: block; margin-top: 9px; color: #ffb9b9; font-size: 12px; }
    .app-cleanup-toast { position: fixed; z-index: 1001; left: 16px; right: 16px; bottom: calc(88px + env(safe-area-inset-bottom)); max-width: 600px; margin: 0 auto; padding: 12px 13px; border: 1px solid rgba(61,184,108,.52); border-radius: 15px; background: rgba(21,49,34,.97); color: #e8fff0; box-shadow: 0 16px 36px rgba(0,0,0,.34); font-size: 13px; }
  `;
  document.head.appendChild(style);
}

function openCleanupDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CLEANUP_DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getLatestCompletedSet() {
  const db = await openCleanupDb();
  try {
    const attemptsTx = db.transaction(CLEANUP_ATTEMPT_STORE, 'readonly');
    const attempts = await requestValue(attemptsTx.objectStore(CLEANUP_ATTEMPT_STORE).getAll());
    const latest = [...attempts]
      .filter((attempt) => attempt && attempt.isCompleted && attempt.setId)
      .sort((a, b) => String(b.completedAt || b.startedAt || '').localeCompare(String(a.completedAt || a.startedAt || '')))[0];
    if (!latest) return null;

    const setsTx = db.transaction(CLEANUP_QUIZ_STORE, 'readonly');
    return await requestValue(setsTx.objectStore(CLEANUP_QUIZ_STORE).get(latest.setId));
  } finally {
    db.close();
  }
}

async function removeQuizSetOnly(id) {
  const db = await openCleanupDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(CLEANUP_QUIZ_STORE, 'readwrite');
      const request = transaction.objectStore(CLEANUP_QUIZ_STORE).delete(id);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

function promoteListDeleteButtons() {
  document.querySelectorAll('.set-card-actions .icon-button').forEach((button) => {
    if (button.classList.contains('visible-delete-button')) return;
    button.classList.add('visible-delete-button');
    button.textContent = '⌫ セットを削除';
    button.setAttribute('aria-label', `${button.getAttribute('aria-label') || 'セットを削除'}`);
  });
}

function showCleanupToast() {
  if (sessionStorage.getItem('newsquiz-set-deleted') !== '1') return;
  sessionStorage.removeItem('newsquiz-set-deleted');
  const toast = document.createElement('div');
  toast.className = 'app-cleanup-toast';
  toast.textContent = 'セットを削除しました。解答履歴と復習記録は残っています。';
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 4200);
}

async function renderCleanupRecommendation() {
  const actions = document.querySelector('.result-actions');
  if (!actions) {
    cleanupSetId = '';
    return;
  }

  const quizSet = await getLatestCompletedSet().catch(() => null);
  if (!quizSet || !quizSet.id) return;
  if (cleanupSetId === quizSet.id && document.querySelector('.app-result-cleanup-card')) return;

  document.querySelector('.app-result-cleanup-card')?.remove();
  cleanupSetId = quizSet.id;

  const card = document.createElement('section');
  card.className = 'app-result-cleanup-card';
  card.dataset.setId = quizSet.id;
  const kicker = document.createElement('p');
  kicker.className = 'section-kicker';
  kicker.textContent = 'SET CLEANUP';
  const heading = document.createElement('h2');
  heading.textContent = 'このセットは、もう片づけても大丈夫。';
  const copy = document.createElement('p');
  copy.textContent = '解答履歴・正答率・復習候補は残ります。もう一度解く予定がなければ、一覧を軽くするために削除できます。';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'このセットを削除';
  const feedback = document.createElement('small');
  feedback.className = 'app-cleanup-feedback';

  button.addEventListener('click', async () => {
    const accepted = window.confirm(`「${quizSet.title || 'このセット'}」を削除しますか？\n解答履歴と復習記録は残ります。`);
    if (!accepted) return;
    button.disabled = true;
    button.textContent = '削除中…';
    try {
      await removeQuizSetOnly(quizSet.id);
      sessionStorage.setItem('newsquiz-set-deleted', '1');
      window.location.reload();
    } catch (error) {
      feedback.textContent = error instanceof Error ? error.message : 'セットを削除できませんでした。';
      button.disabled = false;
      button.textContent = 'このセットを削除';
    }
  });

  card.append(kicker, heading, copy, button, feedback);
  actions.insertAdjacentElement('beforebegin', card);
}

function applySetCleanupPatch() {
  if (cleanupQueued) return;
  cleanupQueued = true;
  requestAnimationFrame(() => {
    cleanupQueued = false;
    injectCleanupStyles();
    promoteListDeleteButtons();
    showCleanupToast();
    void renderCleanupRecommendation();
  });
}

new MutationObserver(applySetCleanupPatch).observe(document.documentElement, { childList: true, subtree: true });
window.setInterval(applySetCleanupPatch, 500);
applySetCleanupPatch();
