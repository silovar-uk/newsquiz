import './external-links-patch.js';

const FRESHNESS_MARKER = '# ニュースの鮮度ルール（必須）';

function quotaFor(total) {
  if (total >= 45) return { within24: 10, within3d: 5, within7d: 3 };
  if (total >= 30) return { within24: 6, within3d: 3, within7d: 2 };
  if (total >= 20) return { within24: 4, within3d: 2, within7d: 1 };
  return { within24: 2, within3d: 1, within7d: 1 };
}

function tokyoNow() {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date()).replace(/\//g, '-').replace(',', '') + ' JST';
}

function getQuestionCount(prompt) {
  const match = prompt.match(/四択クイズを(\d+)問作成してください/);
  return match ? Number(match[1]) : 30;
}

function getValidAsOf(prompt) {
  const match = prompt.match(/# 情報基準日\s*\n([^\n]+)/);
  return match ? match[1].trim() : '情報基準日';
}

function freshnessBlock(prompt) {
  const total = getQuestionCount(prompt);
  const quota = quotaFor(total);
  const validAsOf = getValidAsOf(prompt);
  return `${FRESHNESS_MARKER}
短期ニュースの終点は、情報基準日「${validAsOf}」の生成時点（日本時間）です。生成時点は ${tokyoNow()} です。情報基準日が生成日より過去の場合は、その日の23:59 JSTを終点として扱ってください。

全${total}問のうち、次の短期ニュース問題を必ず含めてください。これは全問を速報化するルールではありません。残りは、背景・地理・制度・歴史・比較など、長く役立つ知識に使ってください。
- 直近24時間以内に起きた／公表されたニュース：${quota.within24}問以上。最優先で選ぶ。
- 24時間超〜72時間以内（3日以内）のニュース：${quota.within3d}問以上。
- 72時間超〜7日以内（4〜7日前）のニュース：${quota.within7d}問以上。

- 上記は「問題数」で数える。短期ニュース枠は原則 direct または roundup に置き、同じ出来事を言い換えて複数問に水増ししない。
- roundup を短期ニュース枠に数えるのは、3つの事実側が同じ鮮度帯に収まり、各選択肢に根拠を示せる場合だけにする。
- 記事の更新日時だけが新しく、出来事そのものが7日より前なら短期ニュース枠に数えない。古い話題の再掲・まとめ・解説記事も同様。
- 各短期ニュース問題は、sources に実在する一次情報または信頼できる報道機関のURLを付け、publishedAt には実際の公開日を記載する。
- sources[].url は必ず https:// から始まる完全な外部URLにする。www.だけのURL、ドメインだけ、相対パスは使わない。
- 確認できない速報、未確定の観測、出典不明のSNS投稿で枠を埋めない。確かな別ニュースに差し替える。

`;
}

function withFreshnessRule(prompt) {
  if (!prompt || prompt.includes(FRESHNESS_MARKER)) return prompt;
  const anchor = '問題構成は次の合計に必ずしてください。';
  const index = prompt.indexOf(anchor);
  if (index === -1) return prompt;
  return `${prompt.slice(0, index)}${freshnessBlock(prompt)}${prompt.slice(index)}`;
}

function updatePromptTextarea() {
  const textarea = document.querySelector('#generated-prompt');
  if (!textarea) return;
  const next = withFreshnessRule(textarea.value);
  if (next !== textarea.value) textarea.value = next;
}

function updateFreshnessPreview() {
  const preview = document.querySelector('.generation-preview');
  const textarea = document.querySelector('#generated-prompt');
  if (!preview || !textarea) return;
  const quota = quotaFor(getQuestionCount(textarea.value));
  let node = preview.querySelector('[data-news-freshness]');
  if (!node) {
    node = document.createElement('div');
    node.dataset.newsFreshness = 'true';
    const planPills = preview.querySelector('.plan-pills');
    planPills?.insertAdjacentElement('afterend', node);
  }
  const markup = `<p class="section-kicker">NEWS FRESHNESS</p><ul class="mix-summary"><li>24時間以内 ${quota.within24}問以上（最優先）</li><li>24〜72時間 ${quota.within3d}問以上</li><li>4〜7日 ${quota.within7d}問以上</li></ul>`;
  if (node.innerHTML !== markup) node.innerHTML = markup;
}

function applyFreshnessPatch() {
  updatePromptTextarea();
  updateFreshnessPreview();
}

document.addEventListener('click', async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest('.prompt-output-card .primary-button');
  if (!button) return;

  const textarea = document.querySelector('#generated-prompt');
  if (!textarea) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const prompt = withFreshnessRule(textarea.value);
  textarea.value = prompt;

  try {
    await navigator.clipboard.writeText(prompt);
    const original = button.textContent;
    button.textContent = 'コピー済み ✓';
    window.setTimeout(() => { button.textContent = original || 'プロンプトをコピー'; }, 1800);
  } catch {
    textarea.focus();
    textarea.select();
    document.execCommand('copy');
  }
}, true);

new MutationObserver(applyFreshnessPatch).observe(document.documentElement, { childList: true, subtree: true });
window.setInterval(applyFreshnessPatch, 400);
applyFreshnessPatch();
