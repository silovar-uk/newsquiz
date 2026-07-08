const FLEXIBLE_CATEGORY_ALIASES = {
  'topic-basics': 'science-culture',
  'topic-basic': 'science-culture',
  basics: 'science-culture',
  'science-technology': 'science-culture',
  science: 'science-culture',
  technology: 'science-culture',
  'history-context': 'science-culture',
  history: 'science-culture',
  context: 'science-culture',
  'key-concepts': 'science-culture',
  'key-concept': 'science-culture',
  concepts: 'science-culture',
  'practice-case': 'science-culture',
  practice: 'science-culture',
  case: 'science-culture',
  'systems-rules': 'economy-politics',
  'system-rules': 'economy-politics',
  systems: 'economy-politics',
  rules: 'economy-politics',
  health: 'science-culture',
  medical: 'science-culture',
  medicine: 'science-culture',
};
const FLEXIBLE_CANONICAL = new Set(['domestic-news', 'world-news', 'sports', 'entertainment', 'japan-basics', 'world-basics', 'economy-politics', 'science-culture']);

function flexibleToken(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s_/]+/g, '-');
}

function flexibleCategory(value) {
  const raw = String(value || '').trim();
  const token = flexibleToken(raw);
  if (FLEXIBLE_CANONICAL.has(token)) return { value: token, changed: false };
  if (FLEXIBLE_CATEGORY_ALIASES[token]) return { value: FLEXIBLE_CATEGORY_ALIASES[token], changed: true };
  if (/国内|日本|地域/.test(raw) || /domestic|japan/.test(token)) return { value: 'domestic-news', changed: true };
  if (/海外|国際|世界/.test(raw) || /world|international|global/.test(token)) return { value: 'world-news', changed: true };
  if (/スポーツ|競技/.test(raw) || /sport/.test(token)) return { value: 'sports', changed: true };
  if (/芸能|映画|音楽|文化|エンタメ/.test(raw) || /entertain|culture/.test(token)) return { value: 'entertainment', changed: true };
  if (/政治|経済|制度|法律|ルール|行政/.test(raw) || /politic|econom|system|rule|law/.test(token)) return { value: 'economy-politics', changed: true };
  return { value: 'science-culture', changed: true };
}

function flexibleType(value) {
  const token = flexibleToken(value);
  if (['false-news', 'false-statement', 'false', 'roundup', 'fact-check', 'factcheck'].includes(token)) return { value: 'false_news', changed: token !== 'false-news' };
  return { value: 'standard', changed: Boolean(token && token !== 'standard') };
}

function flexibleUrl(value) {
  const raw = String(value || '').trim();
  const markdown = raw.match(/^\[[^\]]*\]\((https?:\/\/[^\s)]+)\)$/i);
  const unwrapped = markdown?.[1] || raw;
  if (/^www\./i.test(unwrapped)) return { value: `https://${unwrapped}`, changed: true };
  return { value: unwrapped, changed: Boolean(markdown) };
}

function shuffleChoices(choices) {
  const shuffled = [...choices];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

function normalizeIncomingQuizJson(text) {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.questions)) return { text, summary: null };

  const changes = { schema: 0, category: 0, type: 0, url: 0, choices: 0 };
  if (Number(data.schemaVersion) !== 1) {
    data.schemaVersion = 1;
    changes.schema += 1;
  }

  data.questions.forEach((question) => {
    if (!question || typeof question !== 'object') return;
    const category = flexibleCategory(question.category);
    if (category.changed) changes.category += 1;
    question.category = category.value;

    const type = flexibleType(question.type);
    if (type.changed) changes.type += 1;
    question.type = type.value;
    if (type.value === 'false_news' && question.learningFocus !== 'roundup') question.learningFocus = 'roundup';

    if (Array.isArray(question.choices) && question.choices.length === 4 && question.__appChoicesShuffled !== true) {
      question.choices = shuffleChoices(question.choices);
      question.__appChoicesShuffled = true;
      changes.choices += 1;
    }

    if (Array.isArray(question.sources)) {
      question.sources.forEach((source) => {
        if (!source || typeof source !== 'object' || !source.url) return;
        const url = flexibleUrl(source.url);
        if (url.changed) changes.url += 1;
        source.url = url.value;
      });
    }
  });

  const changed = Object.values(changes).reduce((sum, value) => sum + value, 0) > 0;
  if (!changed) return { text, summary: null };
  const parts = [];
  if (changes.schema) parts.push(`schemaVersion ${changes.schema}件`);
  if (changes.category) parts.push(`カテゴリ ${changes.category}問`);
  if (changes.type) parts.push(`問題形式 ${changes.type}問`);
  if (changes.url) parts.push(`出典URL ${changes.url}件`);
  if (changes.choices) parts.push(`選択肢シャッフル ${changes.choices}問`);
  return { text: JSON.stringify(data, null, 2), summary: `アプリ側で互換化しました：${parts.join('／')}` };
}

function setTextareaValue(textarea, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function showFlexibleImportNotice(summary) {
  document.querySelector('.app-flexible-import-notice')?.remove();
  const textarea = document.querySelector('#quiz-json');
  const host = textarea?.closest('.import-card');
  if (!host || !summary) return;
  const notice = document.createElement('p');
  notice.className = 'app-flexible-import-notice notice-message';
  notice.textContent = `${summary}。内容は変えず、アプリ内の共通形式に合わせました。`;
  host.appendChild(notice);
}

function normalizeBeforeValidation(event) {
  const target = event.target instanceof Element ? event.target.closest('.import-footer button') : null;
  if (!target) return;
  if (target.dataset.flexibleImportBypass === '1') {
    delete target.dataset.flexibleImportBypass;
    return;
  }

  const textarea = document.querySelector('#quiz-json');
  if (!textarea || !textarea.value.trim()) return;
  let result;
  try {
    result = normalizeIncomingQuizJson(textarea.value);
  } catch {
    return;
  }
  if (!result.summary) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  setTextareaValue(textarea, result.text);
  showFlexibleImportNotice(result.summary);
  target.dataset.flexibleImportBypass = '1';
  window.setTimeout(() => target.click(), 0);
}

function injectFlexibleImportStyle() {
  if (document.getElementById('flexible-import-patch-style')) return;
  const style = document.createElement('style');
  style.id = 'flexible-import-patch-style';
  style.textContent = '.app-flexible-import-notice{margin:12px 0 0;color:#cdebd7;font-size:12px;line-height:1.6;}';
  document.head.appendChild(style);
}

document.addEventListener('click', normalizeBeforeValidation, true);
injectFlexibleImportStyle();
