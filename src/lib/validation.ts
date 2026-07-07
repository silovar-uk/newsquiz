import type {
  CategoryId,
  Choice,
  Keyword,
  QuizQuestion,
  QuizSet,
  SourceLink,
  ValidationResult,
} from '../types';

const allowedCategories: CategoryId[] = [
  'domestic-news',
  'world-news',
  'sports',
  'entertainment',
  'japan-basics',
  'world-basics',
  'economy-politics',
  'science-culture',
];

const categoryAliases: Record<string, CategoryId> = {
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

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const normalizeToken = (value: string) => value.trim().toLowerCase().replace(/[\s_/]+/g, '-');

function normalizeCategory(value: unknown): { category: CategoryId; raw: string; remapped: boolean } {
  const raw = isNonEmptyString(value) ? value.trim() : '';
  const token = normalizeToken(raw);
  if (allowedCategories.includes(token as CategoryId)) return { category: token as CategoryId, raw, remapped: false };
  if (categoryAliases[token]) return { category: categoryAliases[token], raw, remapped: true };

  // 日本語・自由記述カテゴリも、止めずに近い大分類へ寄せる。
  if (/国内|日本|地域/.test(raw) || /domestic|japan/.test(token)) return { category: 'domestic-news', raw, remapped: true };
  if (/海外|国際|世界/.test(raw) || /world|international|global/.test(token)) return { category: 'world-news', raw, remapped: true };
  if (/スポーツ|競技/.test(raw) || /sport/.test(token)) return { category: 'sports', raw, remapped: true };
  if (/芸能|映画|音楽|文化|エンタメ/.test(raw) || /entertain|culture/.test(token)) return { category: 'entertainment', raw, remapped: true };
  if (/政治|経済|制度|法律|ルール|行政/.test(raw) || /politic|econom|system|rule|law/.test(token)) return { category: 'economy-politics', raw, remapped: true };

  return { category: 'science-culture', raw, remapped: true };
}

function normalizeType(value: unknown): { type: QuizQuestion['type']; remapped: boolean } {
  const raw = isNonEmptyString(value) ? normalizeToken(value) : '';
  const roundupTypes = new Set(['false-news', 'false-statement', 'false', 'roundup', 'fact-check', 'factcheck']);
  if (raw === 'false-news') return { type: 'false_news', remapped: value !== 'false_news' };
  if (roundupTypes.has(raw)) return { type: 'false_news', remapped: true };
  return { type: 'standard', remapped: Boolean(raw && raw !== 'standard') };
}

function normalizeSourceUrl(value: string): string {
  const raw = value.trim();
  const markdown = raw.match(/^\[[^\]]*\]\((https?:\/\/[^\s)]+)\)$/i);
  const unwrapped = markdown?.[1] || raw;
  if (/^https?:\/\//i.test(unwrapped)) return unwrapped;
  if (/^www\./i.test(unwrapped)) return `https://${unwrapped}`;
  return unwrapped;
}

const normalizeSources = (value: unknown): SourceLink[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .filter((source) => isNonEmptyString(source.name) && isNonEmptyString(source.url))
    .map((source) => ({
      name: String(source.name),
      title: isNonEmptyString(source.title) ? source.title : undefined,
      url: normalizeSourceUrl(String(source.url)),
      publishedAt: isNonEmptyString(source.publishedAt) ? source.publishedAt : undefined,
    }));
};

const normalizeKeywords = (value: unknown): Keyword[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .filter((keyword) => isNonEmptyString(keyword.term) && isNonEmptyString(keyword.shortDefinition))
    .map((keyword) => ({
      term: String(keyword.term),
      shortDefinition: String(keyword.shortDefinition),
      searchQuery: isNonEmptyString(keyword.searchQuery) ? keyword.searchQuery : undefined,
    }));
};

const normalizeChoices = (value: unknown): Choice[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .filter((choice) => isNonEmptyString(choice.id) && isNonEmptyString(choice.text))
    .map((choice) => ({
      id: String(choice.id),
      text: String(choice.text),
      explanation: isNonEmptyString(choice.explanation) ? String(choice.explanation) : '選択肢の解説が未入力です。',
    }));
};

export function validateQuizSet(raw: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(raw)) return { valid: false, errors: ['JSONの最上位はオブジェクトにしてください。'], warnings };

  const questionsRaw = raw.questions;
  if (!Array.isArray(questionsRaw)) return { valid: false, errors: ['questions は配列にしてください。'], warnings };
  if (questionsRaw.length === 0) errors.push('問題が0問です。');
  if (questionsRaw.length !== 30) warnings.push(`問題数は${questionsRaw.length}問です。標準は30問ですが、そのまま取り込めます。`);

  if (typeof raw.schemaVersion === 'number' && raw.schemaVersion !== 1) warnings.push(`schemaVersion ${raw.schemaVersion} は互換モードで取り込みます。`);
  if (!isNonEmptyString(raw.id)) errors.push('set id がありません。');
  if (!isNonEmptyString(raw.title)) errors.push('title がありません。');
  if (!isNonEmptyString(raw.validAsOf)) warnings.push('validAsOf（情報基準日）がありません。ニュース問題では設定を推奨します。');

  const seenIds = new Set<string>();
  const normalizedQuestions: QuizQuestion[] = [];
  const categoryRemaps = new Map<string, { category: CategoryId; count: number }>();
  let typeRemapCount = 0;
  let markdownUrlCount = 0;

  questionsRaw.forEach((item, index) => {
    const number = index + 1;
    if (!isRecord(item)) {
      errors.push(`問題${number}：オブジェクトではありません。`);
      return;
    }

    const id = item.id;
    const prompt = item.prompt;
    const categoryResult = normalizeCategory(item.category);
    const typeResult = normalizeType(item.type);
    const correctChoiceId = item.correctChoiceId;
    const choices = normalizeChoices(item.choices);
    const sources = normalizeSources(item.sources);
    const learningFocus = item.learningFocus === 'context' || item.learningFocus === 'roundup'
      ? item.learningFocus
      : typeResult.type === 'false_news' ? 'roundup' : 'direct';
    const difficulty = item.difficulty === 2 || item.difficulty === 3 ? item.difficulty : 1;

    if (categoryResult.remapped) {
      const key = categoryResult.raw || '未指定';
      const current = categoryRemaps.get(key) || { category: categoryResult.category, count: 0 };
      current.count += 1;
      categoryRemaps.set(key, current);
    }
    if (typeResult.remapped) typeRemapCount += 1;
    if (Array.isArray(item.sources)) {
      markdownUrlCount += item.sources
        .filter(isRecord)
        .filter((source) => isNonEmptyString(source.url) && /^\[[^\]]*\]\(https?:\/\//i.test(String(source.url).trim()))
        .length;
    }

    if (!isNonEmptyString(id)) errors.push(`問題${number}：id がありません。`);
    if (isNonEmptyString(id) && seenIds.has(id)) errors.push(`問題${number}：id「${id}」が重複しています。`);
    if (isNonEmptyString(id)) seenIds.add(id);
    if (!isNonEmptyString(prompt)) errors.push(`問題${number}：prompt がありません。`);
    if (choices.length !== 4) errors.push(`問題${number}：選択肢は4つ必要です。現在は${choices.length}つです。`);
    if (!isNonEmptyString(correctChoiceId)) errors.push(`問題${number}：correctChoiceId がありません。`);
    if (isNonEmptyString(correctChoiceId) && !choices.some((choice) => choice.id === correctChoiceId)) {
      errors.push(`問題${number}：correctChoiceId「${correctChoiceId}」に対応する選択肢がありません。`);
    }
    if (!isNonEmptyString(item.shortExplanation)) warnings.push(`問題${number}：shortExplanation がありません。`);
    if (normalizeKeywords(item.keywords).length === 0) warnings.push(`問題${number}：重要ワードがありません。`);
    if (sources.length === 0) warnings.push(`問題${number}：出典がありません。ニュース問題では出典を付けてください。`);

    if (isNonEmptyString(id) && isNonEmptyString(prompt) && choices.length === 4 && isNonEmptyString(correctChoiceId)) {
      normalizedQuestions.push({
        id,
        type: typeResult.type,
        category: categoryResult.category,
        learningFocus,
        difficulty,
        prompt,
        hint: isNonEmptyString(item.hint) ? item.hint : undefined,
        choices,
        correctChoiceId,
        shortExplanation: isNonEmptyString(item.shortExplanation) ? item.shortExplanation : '解説は未入力です。',
        background: isNonEmptyString(item.background) ? item.background : undefined,
        keywords: normalizeKeywords(item.keywords),
        sources,
      });
    }
  });

  categoryRemaps.forEach((value, rawCategory) => {
    warnings.push(`category「${rawCategory}」${value.count}問を「${value.category}」へ自動分類しました。`);
  });
  if (typeRemapCount > 0) warnings.push(`問題形式 ${typeRemapCount}問をアプリ互換形式へ自動変換しました。`);
  if (markdownUrlCount > 0) warnings.push(`Markdown形式の出典URL ${markdownUrlCount}件を通常の外部URLへ自動変換しました。`);

  if (errors.length > 0) return { valid: false, errors, warnings };

  const theme = isNonEmptyString(raw.theme) ? raw.theme : undefined;
  const mode = raw.mode === 'theme' ? 'theme' : 'balanced';
  const balanceRaw = isRecord(raw.questionBalance) ? raw.questionBalance : {};
  const quizSet: QuizSet = {
    schemaVersion: 1,
    id: String(raw.id),
    title: String(raw.title),
    description: isNonEmptyString(raw.description) ? raw.description : undefined,
    mode,
    theme,
    createdAt: isNonEmptyString(raw.createdAt) ? String(raw.createdAt) : new Date().toISOString(),
    validAsOf: isNonEmptyString(raw.validAsOf) ? String(raw.validAsOf) : new Date().toISOString().slice(0, 10),
    sourceSummary: isNonEmptyString(raw.sourceSummary) ? raw.sourceSummary : undefined,
    questionBalance: {
      direct: typeof balanceRaw.direct === 'number' ? balanceRaw.direct : normalizedQuestions.filter((q) => q.learningFocus === 'direct').length,
      context: typeof balanceRaw.context === 'number' ? balanceRaw.context : normalizedQuestions.filter((q) => q.learningFocus === 'context').length,
      roundup: typeof balanceRaw.roundup === 'number' ? balanceRaw.roundup : normalizedQuestions.filter((q) => q.learningFocus === 'roundup').length,
    },
    questions: normalizedQuestions,
  };

  return { valid: true, errors, warnings, quizSet };
}
