import './quiz-scroll-patch.js';
import './source-layout-patch.js';
import './flexible-import-patch.js';
import './set-cleanup-patch.js';
import './quiz-flow-patch.js';

function normalizeExternalUrl(value) {
  const raw = String(value || '').trim().replace(/\s/g, '');
  if (!raw) return null;

  const candidate = /^https?:\/\//i.test(raw)
    ? raw
    : raw.startsWith('//')
      ? `https:${raw}`
      : /^(?:www\.)/i.test(raw)
        ? `https://${raw}`
        : /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)+(?:[/?#].*)?$/i.test(raw)
          ? `https://${raw}`
          : raw;

  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function sourceSearchUrl(anchor) {
  return `https://www.google.com/search?q=${encodeURIComponent(anchor.textContent || 'ニュース 出典')}`;
}

function repairSourceLinks() {
  document.querySelectorAll('.source-list a').forEach((anchor) => {
    const raw = anchor.dataset.originalSourceUrl || anchor.getAttribute('href') || '';
    if (!anchor.dataset.originalSourceUrl) anchor.dataset.originalSourceUrl = raw;

    const externalUrl = normalizeExternalUrl(raw);
    const nextUrl = externalUrl || sourceSearchUrl(anchor);
    if (anchor.href !== nextUrl) anchor.href = nextUrl;
    anchor.target = '_blank';
    anchor.rel = 'noreferrer noopener';

    if (!externalUrl) {
      anchor.title = '出典URLの形式が不完全なため、出典名と記事名で検索します';
      anchor.dataset.sourceFallback = 'true';
    }
  });
}

let queued = false;
function scheduleRepair() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    repairSourceLinks();
  });
}

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest('.source-list a') : null;
  if (target) repairSourceLinks();
}, true);

new MutationObserver(scheduleRepair).observe(document.documentElement, { childList: true, subtree: true });
scheduleRepair();
