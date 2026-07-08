function injectStickyQuizStatusStyles() {
  if (document.getElementById('quiz-scroll-patch-style')) return;
  const style = document.createElement('style');
  style.id = 'quiz-scroll-patch-style';
  style.textContent = `
    .quiz-header,
    .quiz-progress-wrap {
      position: sticky !important;
      z-index: 18 !important;
      margin-left: -16px !important;
      margin-right: -16px !important;
      padding-left: 16px !important;
      padding-right: 16px !important;
      background: rgba(15,17,23,.96) !important;
      backdrop-filter: blur(16px) !important;
    }
    .quiz-header {
      top: 0 !important;
      padding-top: max(10px, env(safe-area-inset-top)) !important;
      padding-bottom: 6px !important;
      border-bottom: 1px solid rgba(255,255,255,.06) !important;
    }
    .quiz-progress-wrap {
      top: calc(44px + env(safe-area-inset-top)) !important;
      margin-top: 0 !important;
      margin-bottom: 14px !important;
      padding-top: 7px !important;
      padding-bottom: 9px !important;
      border-bottom: 1px solid rgba(255,255,255,.08) !important;
    }
    .progress-caption {
      min-width: 78px !important;
      color: #d8deed !important;
      font-weight: 800 !important;
    }
  `;
  document.head.appendChild(style);
}

function enrichProgressCaption() {
  const caption = document.querySelector('.progress-caption');
  const bar = document.querySelector('.quiz-progress-bar');
  if (!caption || !bar) return;
  const rawWidth = bar.style.width || '0%';
  const percent = Math.round(Number.parseFloat(rawWidth) || 0);
  const text = caption.textContent || '';
  if (text.includes('%')) return;
  caption.textContent = `${percent}%｜${text.replace(/\s+/g, '')}`;
}

const nativeScrollIntoView = Element.prototype.scrollIntoView;
Element.prototype.scrollIntoView = function patchedScrollIntoView(...args) {
  if (this instanceof HTMLElement && this.classList.contains('answer-panel')) {
    return;
  }
  return nativeScrollIntoView.apply(this, args);
};

let queued = false;
function applyQuizScrollPatch() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    injectStickyQuizStatusStyles();
    enrichProgressCaption();
  });
}

new MutationObserver(applyQuizScrollPatch).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
window.setInterval(applyQuizScrollPatch, 500);
applyQuizScrollPatch();
