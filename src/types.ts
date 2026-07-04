export type QuizMode = 'balanced' | 'theme';
export type QuestionType = 'standard' | 'false_news';
export type LearningFocus = 'direct' | 'context' | 'roundup';

export type CategoryId =
  | 'domestic-news'
  | 'world-news'
  | 'sports'
  | 'entertainment'
  | 'japan-basics'
  | 'world-basics'
  | 'economy-politics'
  | 'science-culture';

export interface SourceLink {
  name: string;
  title?: string;
  url: string;
  publishedAt?: string;
}

export interface Keyword {
  term: string;
  shortDefinition: string;
  searchQuery?: string;
}

export interface Choice {
  id: string;
  text: string;
  explanation: string;
}

export interface QuizQuestion {
  id: string;
  type: QuestionType;
  category: CategoryId;
  learningFocus: LearningFocus;
  difficulty: 1 | 2 | 3;
  prompt: string;
  hint?: string;
  choices: Choice[];
  correctChoiceId: string;
  shortExplanation: string;
  background?: string;
  keywords: Keyword[];
  sources: SourceLink[];
}

export interface QuestionBalance {
  direct: number;
  context: number;
  roundup: number;
}

export interface QuizSet {
  schemaVersion: 1;
  id: string;
  title: string;
  description?: string;
  mode: QuizMode;
  theme?: string;
  createdAt: string;
  validAsOf: string;
  sourceSummary?: string;
  questionBalance: QuestionBalance;
  questions: QuizQuestion[];
}

export interface AnswerRecord {
  questionId: string;
  selectedChoiceId: string;
  isCorrect: boolean;
  hintUsed: boolean;
  answerTimeMs: number;
  explanationTimeMs: number;
  bookmarked: boolean;
  answeredAt: string;
}

export interface QuizAttempt {
  id: string;
  setId: string;
  setTitle: string;
  startedAt: string;
  completedAt?: string;
  activeMs: number;
  currentQuestionIndex: number;
  questionStartedAtActiveMs: number;
  answers: AnswerRecord[];
  isCompleted: boolean;
}

export interface PromptSettings {
  mode: QuizMode;
  theme: string;
  questionCount: number;
  directRatio: number;
  roundupCount: number;
  categories: CategoryId[];
  validAsOf: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  quizSet?: QuizSet;
}

export interface AppSettings {
  promptSettings: PromptSettings;
}

export const CATEGORY_META: Record<CategoryId, { label: string; shortLabel: string; emoji: string }> = {
  'domestic-news': { label: '国内ニュース', shortLabel: '国内', emoji: '🗾' },
  'world-news': { label: '海外ニュース', shortLabel: '海外', emoji: '🌍' },
  sports: { label: 'スポーツ', shortLabel: 'スポーツ', emoji: '⚽' },
  entertainment: { label: '芸能・カルチャー', shortLabel: '芸能', emoji: '🎬' },
  'japan-basics': { label: '日本の基礎・地域', shortLabel: '日本基礎', emoji: '🗺️' },
  'world-basics': { label: '世界の基礎・地域', shortLabel: '世界基礎', emoji: '🧭' },
  'economy-politics': { label: '政治・経済・制度', shortLabel: '政経', emoji: '📈' },
  'science-culture': { label: '科学・歴史・文化', shortLabel: '科学文化', emoji: '🔬' },
};

export const DEFAULT_PROMPT_SETTINGS: PromptSettings = {
  mode: 'balanced',
  theme: '',
  questionCount: 30,
  directRatio: 70,
  roundupCount: 3,
  categories: [
    'domestic-news',
    'world-news',
    'sports',
    'entertainment',
    'japan-basics',
    'world-basics',
    'economy-politics',
    'science-culture',
  ],
  validAsOf: new Date().toISOString().slice(0, 10),
};
