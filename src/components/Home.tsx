import type { QuizAttempt, QuizSet } from '../types';
import { CATEGORY_META } from '../types';
import { average, formatDate, formatDateTime, formatDurationLong, getTokyoDate } from '../lib/utils';

interface HomeProps {
  quizSets: QuizSet[];
  attempts: QuizAttempt[];
  onStart: (quizSet: QuizSet, attempt?: QuizAttempt) => void;
  onQuickReview: (quizSet: QuizSet, questionIds: string[]) => void;
  onDeleteSet: (quizSet: QuizSet) => void;
  onNavigate: (view: 'import' | 'prompt' | 'history') => void;
}

const isDemoSet = (quizSet: QuizSet) => quizSet.id.startsWith('demo-');
const isReviewSet = (quizSet: QuizSet) => quizSet.id.startsWith('review-');

export function Home({ quizSets, attempts, onStart, onQuickReview, onDeleteSet, onNavigate }: HomeProps) {
  const completed = attempts.filter((attempt) => attempt.isCompleted);
  const latest = completed[0];
  const latestScore = latest ? latest.answers.filter((answer) => answer.isCorrect).length : 0;
  const averageScore = completed.length ? average(completed.map((attempt) => attempt.answers.filter((answer) => answer.isCorrect).length / Math.max(1, attempt.answers.length))) : 0;
  const ongoingAttempts = attempts.filter((attempt) => !attempt.isCompleted);
  const visibleQuizSets = quizSets.filter((quizSet) => !isReviewSet(quizSet));
  const latestImportedSet = visibleQuizSets.find((quizSet) => !isDemoSet(quizSet));
  const demoSet = visibleQuizSets.find(isDemoSet);
  const ongoingAttempt = ongoingAttempts[0];
  const ongoingSet = ongoingAttempt ? quizSets.find((quizSet) => quizSet.id === ongoingAttempt.setId) : undefined;

  const quickReview = completed
    .map((attempt) => {
      const quizSet = quizSets.find((set) => set.id === attempt.setId);
      if (!quizSet) return null;
      const ids = attempt.answers
        .filter((answer) => !answer.isCorrect || answer.bookmarked || answer.hintUsed)
        .sort((a, b) => {
          const priority = (answer: typeof a) => (!answer.isCorrect ? 0 : answer.bookmarked ? 1 : 2);
          return priority(a) - priority(b);
        })
        .map((answer) => answer.questionId)
        .filter((id, index, array) => array.indexOf(id) === index)
        .slice(0, 5);
      return ids.length ? { quizSet, ids } : null;
    })
    .find((value): value is { quizSet: QuizSet; ids: string[] } => Boolean(value));

  const today = getTokyoDate();
  const latestSetIsToday = latestImportedSet?.validAsOf === today;

  return (
    <main className="page-shell home-shell">
      <section className="hero-card hero-card-compact">
        <p className="hero-eyebrow">NEWS × CONTEXT QUIZ</p>
        <h1>ニュースを、<br />説明できる知識に。</h1>
        <p>国内外のニュース、スポーツ、芸能・カルチャー、地域、制度まで。今日の30問を、あとで使える知識に変える。</p>
      </section>

      {ongoingAttempt && ongoingSet ? (
        <section className="today-action-card today-action-resume">
          <div className="today-action-copy">
            <p className="section-kicker">TODAY'S NEXT STEP</p>
            <span className="action-state">途中保存</span>
            <h2>{ongoingAttempt.answers.length} / {ongoingSet.questions.length}問まで完了</h2>
            <p>{ongoingSet.title}｜集中 {formatDurationLong(ongoingAttempt.activeMs)}</p>
          </div>
          <button className="primary-button today-action-button" onClick={() => onStart(ongoingSet, ongoingAttempt)}>続きから解く</button>
        </section>
      ) : latestImportedSet ? (
        <section className="today-action-card">
          <div className="today-action-copy">
            <p className="section-kicker">TODAY'S NEXT STEP</p>
            <span className="action-state">取り込み済み</span>
            <h2>{latestSetIsToday ? '今日の' : '最新の'}{latestImportedSet.questions.length}問を解く</h2>
            <p>{latestImportedSet.title}｜情報基準日 {formatDate(latestImportedSet.validAsOf)}</p>
          </div>
          <button className="primary-button today-action-button" onClick={() => onStart(latestImportedSet)}>{latestSetIsToday ? '今日のクイズを始める' : '最新セットを始める'}</button>
        </section>
      ) : (
        <section className="today-action-card today-action-prepare">
          <div className="today-action-copy">
            <p className="section-kicker">TODAY'S NEXT STEP</p>
            <span className="action-state">問題セット未準備</span>
            <h2>今日の30問を準備する</h2>
            <p>プロンプトをコピーしてAIで作成し、JSONを貼り付けるだけ。</p>
          </div>
          <div className="today-action-buttons">
            <button className="primary-button today-action-button" onClick={() => onNavigate('prompt')}>問題を準備する</button>
            <button className="secondary-button" onClick={() => onNavigate('import')}>JSONを取り込む</button>
          </div>
          <ol className="mini-steps" aria-label="問題セットの準備手順">
            <li>プロンプトをコピー</li>
            <li>ChatGPTでJSONを作成</li>
            <li>貼り付けて開始</li>
          </ol>
          {demoSet && <button className="text-button demo-link" onClick={() => onStart(demoSet)}>まずはデモ30問を試す →</button>}
        </section>
      )}

      {quickReview && (
        <section className="quick-review-card">
          <div>
            <p className="section-kicker">5-MINUTE REVIEW</p>
            <h2>今日は、復習だけでもOK</h2>
            <p>不正解・ヒント使用・自分で保存した問題から {quickReview.ids.length}問を選びました。</p>
          </div>
          <button className="secondary-button" onClick={() => onQuickReview(quickReview.quizSet, quickReview.ids)}>{quickReview.ids.length}問だけ復習する</button>
        </section>
      )}

      <section className="quick-stats" aria-label="学習の状況">
        <div className="stat-card"><span>完走</span><strong>{completed.length}</strong><small>セット</small></div>
        <div className="stat-card"><span>平均正答</span><strong>{completed.length ? `${Math.round(averageScore * 100)}%` : '—'}</strong><small>完走分</small></div>
        <div className="stat-card"><span>復習候補</span><strong>{completed.flatMap((attempt) => attempt.answers).filter((answer) => !answer.isCorrect || answer.hintUsed || answer.bookmarked).length}</strong><small>自動抽出</small></div>
      </section>

      {latest && (
        <section className="last-result-card">
          <div>
            <p className="section-kicker">前回の結果</p>
            <h2>{latest.setTitle}</h2>
            <p>{formatDateTime(latest.completedAt || latest.startedAt)}｜{latestScore} / {latest.answers.length} 正解｜集中 {formatDurationLong(latest.activeMs)}</p>
          </div>
          <button className="text-button" onClick={() => onNavigate('history')}>振り返る →</button>
        </section>
      )}

      {ongoingAttempts.length > 1 && (
        <section className="section-block">
          <div className="section-heading"><div><p className="section-kicker">SAVED PROGRESS</p><h2>他の途中セット</h2></div></div>
          <div className="set-list">
            {ongoingAttempts.slice(1).map((attempt) => {
              const set = quizSets.find((item) => item.id === attempt.setId);
              if (!set) return null;
              return (
                <article className="set-card resume-card" key={attempt.id}>
                  <div className="set-meta"><span className="set-badge">途中保存</span><span>{attempt.currentQuestionIndex + 1}問目から</span></div>
                  <h3>{set.title}</h3>
                  <p>{attempt.answers.length}問回答済み／集中 {formatDurationLong(attempt.activeMs)}</p>
                  <button className="secondary-button" onClick={() => onStart(set, attempt)}>続きから解く</button>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className="section-block">
        <div className="section-heading">
          <div><p className="section-kicker">SAVED SETS</p><h2>保存済みの問題セット</h2></div>
          <span className="count-pill">{visibleQuizSets.length}件</span>
        </div>
        <div className="set-list">
          {visibleQuizSets.map((quizSet) => {
            const direct = quizSet.questionBalance.direct;
            const context = quizSet.questionBalance.context;
            const roundup = quizSet.questionBalance.roundup;
            const categoryCounts = quizSet.questions.reduce<Record<string, number>>((result, question) => {
              result[question.category] = (result[question.category] || 0) + 1;
              return result;
            }, {});
            const lastAttempt = attempts.find((attempt) => attempt.setId === quizSet.id && attempt.isCompleted);
            return (
              <article className="set-card" key={quizSet.id}>
                <div className="set-meta"><span className={quizSet.mode === 'theme' ? 'set-badge theme' : 'set-badge'}>{isDemoSet(quizSet) ? 'お試しセット' : quizSet.mode === 'theme' ? 'テーマ深掘り' : 'おまかせバランス'}</span><span>情報基準日 {formatDate(quizSet.validAsOf)}</span></div>
                <h3>{quizSet.title}</h3>
                {quizSet.description && <p className="set-description">{quizSet.description}</p>}
                <div className="set-balance"><span>ニュース {direct}</span><span>つながる知識 {context}</span><span>まとめ読み {roundup}</span></div>
                <div className="category-mini-list">
                  {Object.entries(categoryCounts).map(([category, count]) => {
                    const meta = CATEGORY_META[category as keyof typeof CATEGORY_META];
                    return <span key={category}>{meta?.emoji} {count}</span>;
                  })}
                </div>
                {lastAttempt && <p className="previous-score">前回：{lastAttempt.answers.filter((answer) => answer.isCorrect).length}/{lastAttempt.answers.length} 正解</p>}
                <div className="set-card-actions">
                  <button className="primary-button" onClick={() => onStart(quizSet)}>{lastAttempt ? 'もう一度解く' : 'クイズを始める'}</button>
                  <button className="icon-button" onClick={() => onDeleteSet(quizSet)} aria-label={`${quizSet.title}を削除`}>⌫</button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="how-card">
        <p className="section-kicker">HOW IT WORKS</p>
        <ol>
          <li><strong>プロンプトをコピー</strong>してChatGPTなどでその日の問題JSONを作る。</li>
          <li><strong>JSONを貼り付け</strong>て、問題数・選択肢・出典を自動チェック。</li>
          <li><strong>四択で答える</strong>。結論だけ先に読み、必要なら背景まで深掘りする。</li>
        </ol>
      </section>
    </main>
  );
}
