import { useMemo, useState } from 'react';
import type { CategoryId, QuizAttempt, QuizSet } from '../types';
import { CATEGORY_META } from '../types';
import { average, formatDateTime, formatDurationLong } from '../lib/utils';

interface HistoryProps {
  attempts: QuizAttempt[];
  quizSets: QuizSet[];
  onReview: (quizSet: QuizSet, questionIds: string[]) => void;
  onDeleteAttempt: (attempt: QuizAttempt) => void;
  onExport: () => void;
  onImportBackup: (file: File) => Promise<void>;
}

type Filter = 'all' | 'wrong' | 'bookmarked';

export function History({ attempts, quizSets, onReview, onDeleteAttempt, onExport, onImportBackup }: HistoryProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [message, setMessage] = useState('');
  const completed = attempts.filter((attempt) => attempt.isCompleted);
  const allAnswers = completed.flatMap((attempt) => attempt.answers);
  const accuracy = allAnswers.length ? average(allAnswers.map((answer) => Number(answer.isCorrect))) : 0;
  const averageTime = allAnswers.length ? average(allAnswers.map((answer) => answer.answerTimeMs)) : 0;

  const categoryStats = useMemo(() => {
    const stats = new Map<CategoryId, { total: number; correct: number }>();
    completed.forEach((attempt) => {
      const quizSet = quizSets.find((set) => set.id === attempt.setId);
      if (!quizSet) return;
      attempt.answers.forEach((answer) => {
        const question = quizSet.questions.find((item) => item.id === answer.questionId);
        if (!question) return;
        const item = stats.get(question.category) || { total: 0, correct: 0 };
        item.total += 1;
        item.correct += Number(answer.isCorrect);
        stats.set(question.category, item);
      });
    });
    return [...stats.entries()].sort((a, b) => (a[1].correct / a[1].total) - (b[1].correct / b[1].total));
  }, [completed, quizSets]);

  const reviewTargets = useMemo(() => completed.flatMap((attempt) => {
    const quizSet = quizSets.find((set) => set.id === attempt.setId);
    if (!quizSet) return [];
    return attempt.answers
      .filter((answer) => filter === 'wrong' ? !answer.isCorrect : filter === 'bookmarked' ? answer.bookmarked : (!answer.isCorrect || answer.bookmarked || answer.hintUsed))
      .map((answer) => ({ attempt, quizSet, answer }));
  }), [completed, filter, quizSets]);

  const reviewGroups = useMemo(() => {
    const bySet = new Map<string, { quizSet: QuizSet; ids: string[] }>();
    reviewTargets.forEach((item) => {
      const current = bySet.get(item.quizSet.id) || { quizSet: item.quizSet, ids: [] };
      if (!current.ids.includes(item.answer.questionId)) current.ids.push(item.answer.questionId);
      bySet.set(item.quizSet.id, current);
    });
    return [...bySet.values()];
  }, [reviewTargets]);

  const restore = async (file?: File) => {
    if (!file) return;
    try {
      await onImportBackup(file);
      setMessage('バックアップを復元しました。最新の情報を読み込み直してください。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '復元に失敗しました。');
    }
  };

  return (
    <main className="page-shell">
      <section className="page-header">
        <p className="section-kicker">HISTORY & REVIEW</p>
        <h1>解いた分だけ、弱点が見える</h1>
        <p>正答率だけでは終わらせず、間違い・ヒント使用・復習登録から次にやることを出します。</p>
      </section>

      <section className="history-stats">
        <div className="stat-card"><span>完走セット</span><strong>{completed.length}</strong><small>回</small></div>
        <div className="stat-card"><span>累計正答率</span><strong>{allAnswers.length ? `${Math.round(accuracy * 100)}%` : '—'}</strong><small>{allAnswers.length}問</small></div>
        <div className="stat-card"><span>平均回答時間</span><strong>{allAnswers.length ? formatDurationLong(averageTime) : '—'}</strong><small>解説時間を除く</small></div>
      </section>

      {categoryStats.length > 0 && (
        <section className="section-block">
          <div className="section-heading"><div><p className="section-kicker">CATEGORY</p><h2>カテゴリー別の手応え</h2></div></div>
          <div className="category-bars">
            {categoryStats.map(([category, stat]) => {
              const percentage = Math.round((stat.correct / stat.total) * 100);
              const meta = CATEGORY_META[category];
              return <div className="category-bar" key={category}><div><span>{meta.emoji} {meta.label}</span><strong>{percentage}%</strong></div><div className="bar-track"><span style={{ width: `${percentage}%` }} /></div><small>{stat.correct} / {stat.total} 正解</small></div>;
            })}
          </div>
        </section>
      )}

      {reviewGroups.length > 0 && (() => {
        const next = reviewGroups[0];
        const weakestCategory = categoryStats[0]?.[0];
        return (
          <section className="next-action-card">
            <div>
              <p className="section-kicker">NEXT ACTION</p>
              <h2>次にやるなら、これ</h2>
              <p>{weakestCategory ? `${CATEGORY_META[weakestCategory].label}を中心に、` : ''}不正解・ヒント使用から {Math.min(5, next.ids.length)}問を選びました。</p>
            </div>
            <button className="primary-button" onClick={() => onReview(next.quizSet, next.ids.slice(0, 5))}>{Math.min(5, next.ids.length)}問だけ復習する</button>
          </section>
        );
      })()}

      <section className="section-block">
        <div className="section-heading"><div><p className="section-kicker">REVIEW QUEUE</p><h2>今、見直す問題</h2></div><span className="count-pill">{reviewTargets.length}問</span></div>
        <div className="filter-tabs">
          <button className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')}>要復習すべて</button>
          <button className={filter === 'wrong' ? 'is-active' : ''} onClick={() => setFilter('wrong')}>不正解だけ</button>
          <button className={filter === 'bookmarked' ? 'is-active' : ''} onClick={() => setFilter('bookmarked')}>自分で追加</button>
        </div>
        {reviewGroups.length > 0 ? <div className="review-group-list">{reviewGroups.map((group) => <article className="review-group" key={group.quizSet.id}><div><strong>{group.quizSet.title}</strong><span>{group.ids.length}問を復習</span></div><button className="secondary-button" onClick={() => onReview(group.quizSet, group.ids)}>このセットを解き直す</button></article>)}</div> : <div className="empty-card">まだ復習対象はありません。クイズを解くと、不正解や「復習に追加」がここに集まります。</div>}
      </section>

      <section className="section-block">
        <div className="section-heading"><div><p className="section-kicker">PAST RESULTS</p><h2>過去の結果</h2></div></div>
        <div className="attempt-list">
          {completed.map((attempt) => {
            const score = attempt.answers.filter((answer) => answer.isCorrect).length;
            return <article className="attempt-card" key={attempt.id}><div><span className="set-badge">{score}/{attempt.answers.length} 正解</span><h3>{attempt.setTitle}</h3><p>{formatDateTime(attempt.completedAt || attempt.startedAt)}｜集中 {formatDurationLong(attempt.activeMs)}｜平均回答 {formatDurationLong(average(attempt.answers.map((a) => a.answerTimeMs)))}</p></div><button className="icon-button" onClick={() => onDeleteAttempt(attempt)} aria-label="この履歴を削除">⌫</button></article>;
          })}
          {completed.length === 0 && <div className="empty-card">まだ完走したセットがありません。最初の30問を解くと、ここから弱点が見え始めます。</div>}
        </div>
      </section>

      <section className="backup-card">
        <div><p className="section-kicker">BACKUP</p><h2>学習データを持ち運ぶ</h2><p>問題セット、解答履歴、プロンプト設定を1つのJSONで書き出せます。</p></div>
        <div className="backup-actions"><button className="secondary-button" onClick={onExport}>バックアップを書き出す</button><label className="secondary-button file-label">バックアップを復元<input type="file" accept="application/json,.json" hidden onChange={(event) => restore(event.target.files?.[0])} /></label></div>
        {message && <p className="notice-message">{message}</p>}
      </section>
    </main>
  );
}
