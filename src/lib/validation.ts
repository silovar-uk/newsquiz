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

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const normalizeSources = (value: unknown): SourceLink[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .filter((source) => isNonEmptyString(source.name) && isNonEmptyString(source.url))
    .map((source) => ({
      name: String(source.name),
      title: isNonEmptyString(source.title) ? source.title : undefined,
      url: String(source.url),
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

  if (!isNonEmptyString(raw.id)) errors.push('set id がありません。');
  if (!isNonEmptyString(raw.title)) errors.push('title がありません。');
  if (!isNonEmptyString(raw.validAsOf)) warnings.push('validAsOf（情報基準日）がありません。ニュース問題では設定を推奨します。');

  const seenIds = new Set<string>();
  const normalizedQuestions: QuizQuestion[] = [];

  questionsRaw.forEach((item, index) => {
    const number = index + 1;
    if (!isRecord(item)) {
      errors.push(`問題${number}：オブジェクトではありません。`);
      return;
    }

    const id = item.id;
    const prompt = item.prompt;
    const category = item.category;
    const correctChoiceId = item.correctChoiceId;
    const choices = normalizeChoices(item.choices);
    const type = item.type === 'false_news' ? 'false_news' : 'standard';
    const learningFocus = item.learningFocus === 'context' || item.learningFocus === 'roundup' ? item.learningFocus : 'direct';
    const difficulty = item.difficulty === 2 || item.difficulty === 3 ? item.difficulty : 1;

    if (!isNonEmptyString(id)) errors.push(`問題${number}：id がありません。`);
    if (isNonEmptyString(id) && seenIds.has(id)) errors.push(`問題${number}：id「${id}」が重複しています。`);
    if (isNonEmptyString(id)) seenIds.add(id);
    if (!isNonEmptyString(prompt)) errors.push(`問題${number}：prompt がありません。`);
    if (!allowedCategories.includes(category as CategoryId)) errors.push(`問題${number}：category が不正です。`);
    if (choices.length !== 4) errors.push(`問題${number}：選択肢は4つ必要です。現在は${choices.length}つです。`);
    if (!isNonEmptyString(correctChoiceId)) errors.push(`問題${number}：correctChoiceId がありません。`);
    if (isNonEmptyString(correctChoiceId) && !choices.some((choice) => choice.id === correctChoiceId)) {
      errors.push(`問題${number}：correctChoiceId「${correctChoiceId}」に対応する選択肢がありません。`);
    }
    if (!isNonEmptyString(item.shortExplanation)) warnings.push(`問題${number}：shortExplanation がありません。`);
    if (normalizeKeywords(item.keywords).length === 0) warnings.push(`問題${number}：重要ワードがありません。`);
    if (normalizeSources(item.sources).length === 0) warnings.push(`問題${number}：出典がありません。ニュース問題では出典を付けてください。`);

    if (isNonEmptyString(id) && isNonEmptyString(prompt) && allowedCategories.includes(category as CategoryId) && choices.length === 4 && isNonEmptyString(correctChoiceId)) {
      normalizedQuestions.push({
        id,
        type,
        category: category as CategoryId,
        learningFocus,
        difficulty,
        prompt,
        hint: isNonEmptyString(item.hint) ? item.hint : undefined,
        choices,
        correctChoiceId,
        shortExplanation: isNonEmptyString(item.shortExplanation) ? item.shortExplanation : '解説は未入力です。',
        background: isNonEmptyString(item.background) ? item.background : undefined,
        keywords: normalizeKeywords(item.keywords),
        sources: normalizeSources(item.sources),
      });
    }
  });

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
