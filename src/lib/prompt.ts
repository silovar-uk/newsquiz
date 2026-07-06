import type { CategoryId, PromptSettings } from '../types';
import { CATEGORY_META } from '../types';
import { clamp, getTokyoDateTime } from './utils';

const categoryInstruction: Record<CategoryId, string> = {
  'domestic-news': '国内ニュース（政治・社会・経済・地域など）',
  'world-news': '海外ニュース（国際政治・外交・経済・社会など）',
  sports: 'スポーツ（国内外を偏らせず、競技は分散）',
  entertainment: '芸能・カルチャー（国内外を偏らせず、映画・音楽・作品・受賞・人物など）',
  'japan-basics': '日本の基礎・地域（都道府県、地理、産業、歴史、行政）',
  'world-basics': '世界の基礎・地域（国、都市、地理、言語、宗教、産業、国際機関）',
  'economy-politics': '政治・経済・制度（指標、法律、選挙、金融、国際機関）',
  'science-culture': '科学・歴史・文化（科学技術、環境、医療、歴史、文化）',
};

const jsonShape = `{
  "schemaVersion": 1,
  "id": "YYYYMMDD-unique-topic",
  "title": "問題セットのタイトル",
  "description": "このセットで身につくこと",
  "mode": "balanced または theme",
  "theme": "テーマがあれば記載。なければ空文字",
  "createdAt": "ISO 8601日時",
  "validAsOf": "YYYY-MM-DD（ニュース情報の基準日）",
  "sourceSummary": "確認した主要ソースの要約",
  "questionBalance": {"direct": 0, "context": 0, "roundup": 0},
  "questions": [
    {
      "id": "q01",
      "type": "standard または false_news",
      "category": "domestic-news | world-news | sports | entertainment | japan-basics | world-basics | economy-politics | science-culture",
      "learningFocus": "direct | context | roundup",
      "difficulty": 1,
      "prompt": "問題文",
      "hint": "答えを直接言わない短いヒント",
      "choices": [
        {"id":"a","text":"選択肢A","explanation":"Aが正しい／誤りである理由"},
        {"id":"b","text":"選択肢B","explanation":"Bが正しい／誤りである理由"},
        {"id":"c","text":"選択肢C","explanation":"Cが正しい／誤りである理由"},
        {"id":"d","text":"選択肢D","explanation":"Dが正しい／誤りである理由"}
      ],
      "correctChoiceId": "a",
      "shortExplanation": "最初に読む結論。2〜3文。",
      "background": "ニュースの背景・制度・地理・歴史などを、読みやすく具体的に解説。",
      "keywords": [
        {"term":"重要ワード","shortDefinition":"一言でいうと","searchQuery":"Google検索向けの語句"}
      ],
      "sources": [
        {"name":"一次情報または信頼できる報道機関","title":"記事・資料タイトル","url":"https://...","publishedAt":"YYYY-MM-DD"}
      ]
    }
  ]
}`;

function distribution(settings: PromptSettings) {
  const total = settings.questionCount;
  const rawRoundup = clamp(settings.roundupCount, 0, Math.max(0, total - 2));
  const roundup = total >= 10 ? rawRoundup : Math.min(rawRoundup, 1);
  const nonRoundup = total - roundup;
  // 30問・70%・まとめ読み3問 = ニュース21 / つながる知識6 / まとめ読み3。
  const direct = Math.min(nonRoundup, Math.max(1, Math.round(total * (settings.directRatio / 100))));
  const context = Math.max(0, nonRoundup - direct);
  return { direct, context, roundup };
}

function minimumCounts(total: number) {
  if (total >= 45) return { headline: 6, foundation: 5 };
  if (total >= 30) return { headline: 4, foundation: 3 };
  if (total >= 20) return { headline: 3, foundation: 2 };
  return { headline: 1, foundation: 1 };
}

export interface NewsFreshnessQuota {
  within24Hours: number;
  within3Days: number;
  within7Days: number;
}

function newsFreshnessQuota(total: number): NewsFreshnessQuota {
  // 全問を速報化せず、短期ニュースを確実に混ぜる。
  // 30問では 24時間以内6問、24〜72時間3問、4〜7日前2問を必須にする。
  if (total >= 45) return { within24Hours: 10, within3Days: 5, within7Days: 3 };
  if (total >= 30) return { within24Hours: 6, within3Days: 3, within7Days: 2 };
  if (total >= 20) return { within24Hours: 4, within3Days: 2, within7Days: 1 };
  return { within24Hours: 2, within3Days: 1, within7Days: 1 };
}

export function getNewsFreshnessPreview(settings: PromptSettings): string[] {
  const quota = newsFreshnessQuota(settings.questionCount);
  return [
    `24時間以内 ${quota.within24Hours}問以上（最優先）`,
    `24〜72時間 ${quota.within3Days}問以上`,
    `4〜7日 ${quota.within7Days}問以上`,
  ];
}

function newsFreshnessInstruction(settings: PromptSettings, isTheme: boolean) {
  const quota = newsFreshnessQuota(settings.questionCount);
  const themeRule = isTheme
    ? 'テーマに結びつく直近ニュースを最優先に選んでください。テーマと直接結びつく確かな短期ニュースが足りないときだけ、残りの短期ニュース枠は一般の重要時事で補い、テーマ中心の構成を崩さないでください。'
    : '国内外・スポーツ・芸能・科学などを横断して、重要度と多様性の両方を満たしてください。';

  return `# ニュースの鮮度ルール（必須）
短期ニュースの終点は、情報基準日「${settings.validAsOf}」の生成時点（日本時間）です。生成時点は ${getTokyoDateTime()} です。情報基準日が生成日より過去の場合は、その日の23:59 JSTを終点として扱ってください。

全${settings.questionCount}問のうち、次の短期ニュース問題を必ず含めてください。これは全問を速報化するルールではありません。残りは、背景・地理・制度・歴史・比較など、長く役立つ知識に使ってください。
- 直近24時間以内に起きた／公表されたニュース：${quota.within24Hours}問以上。最優先で選ぶ。
- 24時間超〜72時間以内（3日以内）のニュース：${quota.within3Days}問以上。
- 72時間超〜7日以内（4〜7日前）のニュース：${quota.within7Days}問以上。

- 上記は「問題数」で数える。短期ニュース枠は原則 direct または roundup に置き、同じ出来事を言い換えて複数問に水増ししない。
- roundup を短期ニュース枠に数えるのは、3つの事実側が同じ鮮度帯に収まり、各選択肢に根拠を示せる場合だけにする。
- 記事の更新日時だけが新しく、出来事そのものが7日より前なら短期ニュース枠に数えない。古い話題の再掲・まとめ・解説記事も同様。
- 各短期ニュース問題は、sources に実在する一次情報または信頼できる報道機関のURLを付け、publishedAt には実際の公開日を記載する。
- 確認できない速報、未確定の観測、出典不明のSNS投稿で枠を埋めない。確かな別ニュースに差し替える。
- ${themeRule}`;
}

export function getBalancedMixPreview(settings: PromptSettings): string[] {
  const selected = settings.categories.length > 0 ? settings.categories : Object.keys(categoryInstruction) as CategoryId[];
  const selectedSet = new Set(selected);
  const { headline, foundation } = minimumCounts(settings.questionCount);
  const items: string[] = [];

  if (selectedSet.has('domestic-news')) items.push(`国内ニュース ${headline}問以上`);
  if (selectedSet.has('world-news')) items.push(`海外ニュース ${headline}問以上`);
  if (selectedSet.has('sports')) items.push(`スポーツ ${headline}問以上（国内外を混ぜる）`);
  if (selectedSet.has('entertainment')) items.push(`芸能・カルチャー ${headline}問以上（国内外を混ぜる）`);

  const hasJapanBasics = selectedSet.has('japan-basics');
  const hasWorldBasics = selectedSet.has('world-basics');
  if (hasJapanBasics && hasWorldBasics) items.push(`日本・世界の基礎を合計 ${foundation * 2}問以上`);
  else if (hasJapanBasics) items.push(`日本の基礎・地域 ${foundation}問以上`);
  else if (hasWorldBasics) items.push(`世界の基礎・地域 ${foundation}問以上`);

  const hasEconomy = selectedSet.has('economy-politics');
  const hasScienceCulture = selectedSet.has('science-culture');
  if (hasEconomy && hasScienceCulture) items.push(`政治経済・科学文化を合計 ${foundation * 2}問以上`);
  else if (hasEconomy) items.push(`政治・経済・制度 ${foundation}問以上`);
  else if (hasScienceCulture) items.push(`科学・歴史・文化 ${foundation}問以上`);

  return items;
}

function defaultMix(settings: PromptSettings, categoryIds: CategoryId[]) {
  const humanLabels = categoryIds.map((id) => CATEGORY_META[id].label).join('／');
  const minimums = getBalancedMixPreview(settings);
  const quotas = minimums.length
    ? `全${settings.questionCount}問のなかで、次の最低数を必ず満たしてください。\n${minimums.map((item) => `- ${item}`).join('\n')}`
    : '有効カテゴリーの中で、直近ニュースと長く役立つ基礎知識を偏りなく混ぜてください。';
  return `有効カテゴリーは「${humanLabels}」。
${quotas}
- スポーツと芸能・カルチャーを選択している場合、国内と海外の双方を含める。
- 上記の最低数を満たした上で、余りは直近ニュース・注目テーマ・基礎知識に配分する。
- 特定人物、特定競技、特定ジャンルに偏らず、今の話題と長く役立つ知識をつなげる。`;
}

export function buildPrompt(settings: PromptSettings): string {
  const { direct, context, roundup } = distribution(settings);
  const selectedCategories = settings.categories.length > 0 ? settings.categories : Object.keys(categoryInstruction) as CategoryId[];
  const categoryRules = selectedCategories.map((id) => `- ${categoryInstruction[id]}`).join('\n');
  const themeText = settings.theme.trim();
  const isTheme = settings.mode === 'theme' && themeText.length > 0;
  const freshnessText = newsFreshnessInstruction(settings, isTheme);
  const balanceText = isTheme
    ? `テーマは「${themeText}」。全${settings.questionCount}問のうち、${direct}問はテーマの中心を直接問う問題にしてください。${context}問だけ、テーマを理解するための背景・周辺・比較・前提知識に広げてください。派生問題が主役にならないようにしてください。`
    : `テーマ指定なしの標準セットです。全${settings.questionCount}問を、直近ニュースとニュースを理解するための基礎知識でバランスよく構成してください。\n${defaultMix(settings, selectedCategories)}`;

  return `あなたは、ニュースを「知っている」だけでなく「背景まで説明できる」状態に変える、非常に優秀なクイズ編集者です。

# 目的
スマートフォンで解く四択クイズを${settings.questionCount}問作成してください。読者は日本語話者の社会人です。単なる暗記ではなく、ニュースの理解力、地理感覚、制度理解、スポーツ・芸能を含む一般常識を育ててください。

# 情報基準日
${settings.validAsOf}
この日までに確認できる情報だけを使ってください。速報、数字、役職、受賞、試合結果、芸能ニュースなど変動する事実は、必ず一次情報または信頼できる報道機関のURLで確認してください。確認できない事実・曖昧な出典・推測は問題にしないでください。

# 出題方針
${balanceText}

${freshnessText}

問題構成は次の合計に必ずしてください。
- direct：${direct}問（聞かれているテーマ・ニュースの直接的な理解を問う）
- context：${context}問（背景、比較、地理、制度、歴史など。ただし派生しすぎない）
- roundup：${roundup}問（「次のうち事実と異なるものはどれ？」形式）

# 使用カテゴリー
${categoryRules}

# 四択問題の品質ルール
- 選択肢は必ず4つ。正解は必ず1つだけ。
- 問題文だけで答えが透けないようにする。
- 誤答選択肢も、同じ分野で迷いやすいが明確に誤りと説明できるものにする。
- 解答後に、正解の理由だけでなく、4つすべての選択肢について正誤と理由が分かるようにする。
- shortExplanation は最初に読む結論。簡潔だが、答えの理由を必ず含める。
- background は「なぜ今この話を知るとニュースが分かるのか」まで解説する。
- keywords は1〜3個。固有名詞だけでなく、制度・概念も優先する。
- sources は各問題に1件以上。URLは実在し、直接開けるものにする。
- 同じ知識・同じ人物・同じ数値を繰り返し問わない。
- 時事問題では「情報基準日」をまたぐ変化が起きうる点を、必要に応じて解説に明記する。

# roundup（3本本当＋1本うそ）問題の追加ルール
- type は "false_news"、learningFocus は "roundup" にする。
- prompt は「次のうち、事実と異なるものはどれですか？」の趣旨にする。
- 4選択肢のうち、3つは情報基準日時点で確認できる本当のニュース・事実、1つだけがもっともらしい誤情報。
- 4選択肢は短く独立して理解できる文章にする。
- 各 choice.explanation で、その選択肢が事実か誤りか、根拠を具体的に説明する。
- うその選択肢は、実在人物・団体を不当に傷つける内容、災害・犯罪・健康に関する危険な誤情報、名誉を損なう内容にしない。

# 出力ルール
- 下のJSONスキーマに完全準拠したJSONだけを返してください。
- Markdownのコードブロック、前置き、補足、説明文は一切出さないでください。
- JSONとしてパースできるように、末尾カンマやコメントを入れないでください。
- questionBalance の合計は必ず ${settings.questionCount} にしてください。

# JSONスキーマ
${jsonShape}`;
}

export function getDistribution(settings: PromptSettings) {
  return distribution(settings);
}
