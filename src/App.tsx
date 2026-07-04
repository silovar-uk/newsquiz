import { useEffect, useMemo, useState } from 'react';
import demoSetRaw from './data/demoSet.json';
import { Home } from './components/Home';
import { ImportPanel } from './components/ImportPanel';
import { PromptBuilder } from './components/PromptBuilder';
import { History } from './components/History';
import { QuizRunner } from './components/QuizRunner';
import { Result } from './components/Result';
import type { AppSettings, QuizAttempt, QuizSet } from './types';
import { DEFAULT_PROMPT_SETTINGS } from './types';
import { deleteAttempt, deleteQuizSet, exportAllData, getAttempts, getQuizSets, getSettings, importAllData, putAttempt, putQuizSet, putSettings } from './lib/db';
import { getTokyoDate, makeId } from './lib/utils';
import { validateQuizSet } from './lib/validation';
import './styles.css';

type View = 'home' | 'import' | 'prompt' | 'history' | 'quiz' | 'result';

const getDefaultSettings = (): AppSettings => ({
  promptSettings: {
    ...DEFAULT_PROMPT_SETTINGS,
    validAsOf: getTokyoDate(),
  },
});

function createAttempt(quizSet: QuizSet): QuizAttempt {
  return {
    id: makeId('attempt'),
    setId: quizSet.id,
    setTitle: quizSet.title,
    startedAt: new Date().toISOString(),
    activeMs: 0,
    currentQuestionIndex: 0,
    questionStartedAtActiveMs: 0,
    answers: [],
    isCompleted: false,
  };
}

function buildReviewSet(source: QuizSet, questionIds: string[]): QuizSet {
  const questions = source.questions.filter((question) => questionIds.includes(question.id));
  const questionBalance = {
    direct: questions.filter((question) => question.learningFocus === 'direct').length,
    context: questions.filter((question) => question.learningFocus === 'context').length,
    roundup: questions.filter((question) => question.learningFocus === 'roundup').length,
  };
  return {
    ...source,
    id: makeId('review'),
    title: `復習｜${source.title}`,
    description: '不正解・ヒント使用・自分で復習登録した問題だけを集めた再挑戦セット。',
    createdAt: new Date().toISOString(),
    questionBalance,
    questions,
  };
}

export default function App() {
  const [view, setView] = useState<View>('home');
  const [quizSets, setQuizSets] = useState<QuizSet[]>([]);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [settings, setSettings] = useState<AppSettings>(getDefaultSettings());
  const [activeSet, setActiveSet] = useState<QuizSet | null>(null);
  const [activeAttempt, setActiveAttempt] = useState<QuizAttempt | null>(null);
  const [resultAttempt, setResultAttempt] = useState<QuizAttempt | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const sortedQuizSets = useMemo(() => [...quizSets].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [quizSets]);
  const sortedAttempts = useMemo(() => [...attempts].sort((a, b) => b.startedAt.localeCompare(a.startedAt)), [attempts]);

  const refreshFromDatabase = async () => {
    const [storedSets, storedAttempts, storedSettings] = await Promise.all([getQuizSets(), getAttempts(), getSettings()]);
    let nextSets = storedSets;
    if (nextSets.length === 0) {
      const demoValidation = validateQuizSet(demoSetRaw);
      if (!demoValidation.valid || !demoValidation.quizSet) throw new Error('内蔵デモセットを読み込めませんでした。');
      await putQuizSet(demoValidation.quizSet);
      nextSets = [demoValidation.quizSet];
    }
    setQuizSets(nextSets);
    setAttempts(storedAttempts);
    setSettings(storedSettings || getDefaultSettings());
  };

  useEffect(() => {
    refreshFromDatabase()
      .catch((error) => setLoadError(error instanceof Error ? error.message : 'データの読み込みに失敗しました。'))
      .finally(() => setLoading(false));
  }, []);

  const persistAttempt = (attempt: QuizAttempt) => {
    setAttempts((previous) => [attempt, ...previous.filter((item) => item.id !== attempt.id)]);
    void putAttempt(attempt).catch((error) => setLoadError(error instanceof Error ? error.message : '解答履歴を保存できませんでした。'));
  };

  const startQuiz = (quizSet: QuizSet, existingAttempt?: QuizAttempt) => {
    const nextAttempt = existingAttempt || createAttempt(quizSet);
    setActiveSet(quizSet);
    setActiveAttempt(nextAttempt);
    setResultAttempt(null);
    setView('quiz');
    persistAttempt(nextAttempt);
  };

  const completeQuiz = (attempt: QuizAttempt) => {
    persistAttempt(attempt);
    setActiveAttempt(attempt);
    setResultAttempt(attempt);
    setView('result');
  };

  const importQuizSet = async (quizSet: QuizSet) => {
    await putQuizSet(quizSet);
    setQuizSets((previous) => [quizSet, ...previous.filter((item) => item.id !== quizSet.id)]);
  };

  const removeQuizSet = async (quizSet: QuizSet) => {
    const accepted = window.confirm(`「${quizSet.title}」を削除しますか？\n解答履歴は残ります。`);
    if (!accepted) return;
    await deleteQuizSet(quizSet.id);
    setQuizSets((previous) => previous.filter((item) => item.id !== quizSet.id));
  };

  const updatePromptSettings = (promptSettings: AppSettings['promptSettings']) => {
    const next = { promptSettings };
    setSettings(next);
    void putSettings(next);
  };

  const review = (source: QuizSet, questionIds: string[]) => {
    if (questionIds.length === 0) return;
    const reviewSet = buildReviewSet(source, questionIds);
    void (async () => {
      try {
        // 復習セットも保存しておくと、途中離脱・履歴・結果の照合が壊れません。
        await importQuizSet(reviewSet);
        startQuiz(reviewSet);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : '復習セットを準備できませんでした。');
      }
    })();
  };

  const exportBackup = async () => {
    const payload = await exportAllData();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `news-context-quiz-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const restoreBackup = async (file: File) => {
    const content = await file.text();
    const parsed = JSON.parse(content);
    await importAllData(parsed);
    await refreshFromDatabase();
  };

  if (loading) return <div className="loading-screen"><div className="loading-orb" /><p>知識の地図を準備中…</p></div>;
  if (loadError && quizSets.length === 0) return <div className="loading-screen"><p>読み込みエラー</p><strong>{loadError}</strong><button className="secondary-button" onClick={() => window.location.reload()}>再読み込み</button></div>;

  return (
    <div className="app-root">
      {loadError && <div className="top-error">{loadError}</div>}
      {view === 'home' && <Home quizSets={sortedQuizSets} attempts={sortedAttempts} onStart={startQuiz} onQuickReview={review} onDeleteSet={(set) => void removeQuizSet(set)} onNavigate={setView} />}
      {view === 'import' && <ImportPanel onImport={importQuizSet} />}
      {view === 'prompt' && <PromptBuilder settings={settings.promptSettings} onSettingsChange={updatePromptSettings} />}
      {view === 'history' && <History attempts={sortedAttempts} quizSets={sortedQuizSets} onReview={review} onDeleteAttempt={(attempt) => { if (window.confirm('この解答履歴を削除しますか？')) { void deleteAttempt(attempt.id); setAttempts((previous) => previous.filter((item) => item.id !== attempt.id)); } }} onExport={() => void exportBackup()} onImportBackup={restoreBackup} />}
      {view === 'quiz' && activeSet && activeAttempt && <QuizRunner quizSet={activeSet} initialAttempt={activeAttempt} onPersist={persistAttempt} onComplete={completeQuiz} onExit={() => setView('home')} />}
      {view === 'result' && resultAttempt && activeSet && <Result attempt={resultAttempt} quizSet={activeSet} onHome={() => setView('home')} onRetryReview={(ids) => review(activeSet, ids)} />}

      {!['quiz', 'result'].includes(view) && (
        <nav className="bottom-nav" aria-label="主なメニュー">
          <button className={view === 'home' ? 'is-active' : ''} onClick={() => setView('home')}><span>⌂</span>ホーム</button>
          <button className={view === 'import' ? 'is-active' : ''} onClick={() => setView('import')}><span>⇩</span>取込</button>
          <button className={view === 'prompt' ? 'is-active' : ''} onClick={() => setView('prompt')}><span>✦</span>作成</button>
          <button className={view === 'history' ? 'is-active' : ''} onClick={() => setView('history')}><span>◷</span>履歴</button>
        </nav>
      )}
    </div>
  );
}
