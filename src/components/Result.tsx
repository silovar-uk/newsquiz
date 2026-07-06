import { useMemo, useState, type CSSProperties } from 'react';
import type { QuizAttempt, QuizSet } from '../types';
import { CATEGORY_META } from '../types';
import { deleteQuizSet } from '../lib/db';
import { average, formatDurationLong } from '../lib/utils';

interface ResultProps {
  attempt: QuizAttempt;
  quizSet: QuizSet;
  onHome: () => void;
  onRetryReview: (questionIds: string[]) => void;
}

export function Result({ attempt, quizSet, onHome, onRetryReview }: ResultProps) {
  const [isDeletingSet, setIsDeletingSet] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const correct = attempt.answers.filter((answer) => answer.isCorrect).length;
  const total = quizSet.questions.length;
  const percentage = Math.round((correct / Math.max(1, total)) * 100);
  const reviewAnswers = attempt.answers.filter((answer) => !answer.isCorrect || answer.hintUsed || answer.bookmarked);
  const categoryStats = useMemo(() => {
    const stats = new Map<string, { total: number; correct: number }>();
    attempt.answers.forEach((answer) => {
      const question = quizSet.questions.find((item) => item.id === answer.questionId);
      if (!question) return;
      const current = stats.get(question.category) || { total: 0, correct: 0 };
      current.total += 1;
      current.correct += Number(answer.isCorrect);
      stats.set(question.category, current);
    });
    return [...stats.entries()].sort((a, b) => (a[1].correct / a[1].total) - (b[1].correct / b[1].total));
  }, [attempt.answers, quizSet.questions]);
  const weakest = categoryStats[0];
  const keywordCounts = useMemo(() => {
    const values = new Map<string, { definition: string; count: number; query: string }>();
    reviewAnswers.forEach((answer) => {
      const question = quizSet.questions.find((item) => item.id === answer.questionId);
      question?.keywords.forEach((keyword) => {
        const current = values.get(keyword.term) || { definition: keyword.shortDefinition, count: 0, query: keyword.searchQuery || keyword.term };
        current.count += 1;
        values.set(keyword.term, current);
      });
    });
    return [...values.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 6);
  }, [quizSet.questions, reviewAnswers]);

  const removeCompletedSet = async () => {
    const accepted = window.confirm(`「${quizSet.title}」を削除しますか？\n解答履歴と復習記録は残ります。`);
    if (!accepted) return;

    setDeleteError('');
    setIsDeletingSet(true);
    try {
      await deleteQuizSet(quizSet.id);
      // Appのメモリ上の一覧も確実に更新するため、ホームを新しい状態で開き直す。
      window.location.reload();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'セットを削除できませんでした。');
      setIsDeletingSet(false);
    }
  };

  return (
    <main className="page-shell result-shell">
      <section className="score-hero">
        <p className="section-kicker">QUIZ COMPLETE</p>
        <div className="score-circle" style={{ '--score': `${percentage}%` } as CSSProperties}><strong>{percentage}</strong><span>%</span></div>
        <h1>{correct} / {total} 正解</h1>
        <p>集中 {formatDurationLong(attempt.activeMs)}｜平均回答 {formatDurationLong(average(attempt.answers.map((answer) => answer.answerTimeMs)))}</p>
        <div className="score-message">{percentage >= 85 ? 'かなり良い。解説まで読んだ分、次のニュースが見えやすくなる。' : percentage >= 65 ? '土台はできてる。復習でつながりが一気に増えるゾーン。' : 'ここからが面白い。知らないところが、次に伸びる地図になってる。'}</div>
      </section>

      <section className="result-summary-card">
        <div><span>ヒント使用</span><strong>{attempt.answers.filter((answer) => answer.hintUsed).length}問</strong></div>
        <div><span>復習登録</span><strong>{attempt.answers.filter((answer) => answer.bookmarked).length}問</strong></div>
        <div><span>要復習</span><strong>{reviewAnswers.length}問</strong></div>
      </section>

      {weakest && <section className="insight-card"><p className="section-kicker">NEXT FOCUS</p><h2>次に見るなら「{CATEGORY_META[weakest[0] as keyof typeof CATEGORY_META].label}」</h2><p>{weakest[1].correct} / {weakest[1].total} 正解。正答率だけでなく、間違えた選択肢の解説を読んで「何と何を混同したか」を残すと伸びやすい。</p></section>}

      <section className="section-block">
        <div className="section-heading"><div><p className="section-kicker">CATEGORY</p><h2>分野ごとの結果</h2></div></div>
        <div className="category-bars">{categoryStats.map(([category, stat]) => { const rate = Math.round((stat.correct / stat.total) * 100); const meta = CATEGORY_META[category as keyof typeof CATEGORY_META]; return <div className="category-bar" key={category}><div><span>{meta.emoji} {meta.label}</span><strong>{rate}%</strong></div><div className="bar-track"><span style={{ width: `${rate}%` }} /></div><small>{stat.correct} / {stat.total} 正解</small></div>; })}</div>
      </section>

      {keywordCounts.length > 0 && <section className="section-block"><div className="section-heading"><div><p className="section-kicker">WORDS TO KEEP</p><h2>今日、持ち帰る重要ワード</h2></div></div><div className="keyword-list">{keywordCounts.map(([term, data]) => <a className="keyword-card" key={term} href={`https://www.google.com/search?q=${encodeURIComponent(data.query)}`} target="_blank" rel="noreferrer"><strong>{term}</strong><span>{data.definition}</span><small>Googleで調べる ↗</small></a>)}</div></section>}

      <section className="result-cleanup-card">
        <p className="section-kicker">SET CLEANUP</p>
        <h2>このセットは、もう片づけても大丈夫。</h2>
        <p>解答履歴・正答率・復習候補は残ります。もう一度このセットを解く予定がなければ、一覧を軽くするために削除できます。</p>
        <button className="danger-button" onClick={() => void removeCompletedSet()} disabled={isDeletingSet}>{isDeletingSet ? '削除中…' : 'このセットを削除'}</button>
        {deleteError && <small className="delete-set-error">{deleteError}</small>}
      </section>

      <div className="result-actions">
        {reviewAnswers.length > 0 && <button className="primary-button" onClick={() => onRetryReview(reviewAnswers.map((answer) => answer.questionId))}>要復習 {reviewAnswers.length}問を解き直す</button>}
        <button className="secondary-button" onClick={onHome}>ホームへ戻る</button>
      </div>
    </main>
  );
}
