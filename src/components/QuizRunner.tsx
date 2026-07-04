import { useEffect, useMemo, useRef, useState } from 'react';
import type { AnswerRecord, QuizAttempt, QuizSet } from '../types';
import { CATEGORY_META } from '../types';
import { formatDuration, formatDurationLong } from '../lib/utils';

interface QuizRunnerProps {
  quizSet: QuizSet;
  initialAttempt: QuizAttempt;
  onPersist: (attempt: QuizAttempt) => void;
  onComplete: (attempt: QuizAttempt) => void;
  onExit: () => void;
}

function getAnswer(attempt: QuizAttempt, questionId: string) {
  return attempt.answers.find((answer) => answer.questionId === questionId);
}

export function QuizRunner({ quizSet, initialAttempt, onPersist, onComplete, onExit }: QuizRunnerProps) {
  const [attempt, setAttempt] = useState<QuizAttempt>(initialAttempt);
  const [activeMs, setActiveMs] = useState(initialAttempt.activeMs);
  const [showHint, setShowHint] = useState(Boolean(getAnswer(initialAttempt, quizSet.questions[initialAttempt.currentQuestionIndex]?.id ?? '')?.hintUsed));
  const [showDetails, setShowDetails] = useState(false);
  const lastTick = useRef(performance.now());
  const answerPanelRef = useRef<HTMLElement>(null);

  const currentQuestion = quizSet.questions[attempt.currentQuestionIndex];
  const currentAnswer = currentQuestion ? getAnswer(attempt, currentQuestion.id) : undefined;
  const progress = quizSet.questions.length ? ((attempt.currentQuestionIndex + (currentAnswer ? 1 : 0)) / quizSet.questions.length) * 100 : 0;

  useEffect(() => {
    const handleVisibility = () => {
      lastTick.current = performance.now();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const now = performance.now();
      const delta = now - lastTick.current;
      lastTick.current = now;
      setActiveMs((previous) => previous + Math.min(delta, 1000));
    }, 250);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onPersist({ ...attempt, activeMs });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [attempt, activeMs, onPersist]);

  useEffect(() => {
    setShowDetails(false);
    setShowHint(Boolean(getAnswer(attempt, quizSet.questions[attempt.currentQuestionIndex]?.id ?? '')?.hintUsed));
    // 現在の問題が変わったときだけ、解説の開閉を初期化する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt.currentQuestionIndex, quizSet.id]);

  useEffect(() => {
    if (!currentAnswer) return;
    const frame = window.requestAnimationFrame(() => {
      answerPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentAnswer?.selectedChoiceId, currentQuestion?.id]);

  const category = currentQuestion ? CATEGORY_META[currentQuestion.category] : undefined;
  const isLastQuestion = attempt.currentQuestionIndex === quizSet.questions.length - 1;
  const correctCount = useMemo(() => attempt.answers.filter((answer) => answer.isCorrect).length, [attempt.answers]);

  if (!currentQuestion || !category) return null;

  const saveAttempt = (nextAttempt: QuizAttempt) => {
    setAttempt(nextAttempt);
    onPersist(nextAttempt);
  };

  const selectChoice = (choiceId: string) => {
    if (currentAnswer) return;
    const answerTimeMs = Math.max(0, activeMs - attempt.questionStartedAtActiveMs);
    const selectedChoice = currentQuestion.choices.find((choice) => choice.id === choiceId);
    if (!selectedChoice) return;

    const answer: AnswerRecord = {
      questionId: currentQuestion.id,
      selectedChoiceId: choiceId,
      isCorrect: choiceId === currentQuestion.correctChoiceId,
      hintUsed: showHint,
      answerTimeMs,
      explanationTimeMs: 0,
      bookmarked: false,
      answeredAt: new Date().toISOString(),
    };

    saveAttempt({
      ...attempt,
      activeMs,
      answers: [...attempt.answers.filter((item) => item.questionId !== currentQuestion.id), answer],
    });
  };

  const toggleBookmark = () => {
    if (!currentAnswer) return;
    const nextAnswers = attempt.answers.map((answer) =>
      answer.questionId === currentQuestion.id ? { ...answer, bookmarked: !answer.bookmarked } : answer,
    );
    saveAttempt({ ...attempt, activeMs, answers: nextAnswers });
  };

  const moveNext = () => {
    if (!currentAnswer) return;

    const explanationTimeMs = Math.max(
      0,
      activeMs - attempt.questionStartedAtActiveMs - currentAnswer.answerTimeMs,
    );
    const updatedAnswers = attempt.answers.map((answer) =>
      answer.questionId === currentQuestion.id ? { ...answer, explanationTimeMs } : answer,
    );

    if (isLastQuestion) {
      const finishedAttempt: QuizAttempt = {
        ...attempt,
        activeMs,
        answers: updatedAnswers,
        completedAt: new Date().toISOString(),
        isCompleted: true,
      };
      setAttempt(finishedAttempt);
      onComplete(finishedAttempt);
      return;
    }

    const nextAttempt: QuizAttempt = {
      ...attempt,
      activeMs,
      answers: updatedAnswers,
      currentQuestionIndex: attempt.currentQuestionIndex + 1,
      questionStartedAtActiveMs: activeMs,
    };
    setShowHint(false);
    setShowDetails(false);
    saveAttempt(nextAttempt);
  };

  const hintWasUsed = currentAnswer?.hintUsed ?? showHint;
  const isRoundup = currentQuestion.type === 'false_news';
  const nextLabel = isLastQuestion ? `結果を見る（${correctCount}問正解）` : '次の問題へ';

  return (
    <main className="quiz-shell">
      <header className="quiz-header">
        <button className="text-button" onClick={onExit} aria-label="クイズを終了してホームへ戻る">終了</button>
        <div className="quiz-timer" aria-label={`集中時間 ${formatDuration(activeMs)}`}>⏱ {formatDuration(activeMs)}</div>
      </header>

      <div className="quiz-progress-wrap" aria-label={`進捗 ${Math.round(progress)}%`}>
        <div className="quiz-progress-track"><div className="quiz-progress-bar" style={{ width: `${progress}%` }} /></div>
        <div className="progress-caption">{attempt.currentQuestionIndex + 1} / {quizSet.questions.length}</div>
      </div>

      <section className="question-card">
        <div className="question-topline">
          <span className="category-chip">{category.emoji} {category.shortLabel}</span>
          <span className={`focus-chip focus-${currentQuestion.learningFocus}`}>{currentQuestion.learningFocus === 'direct' ? 'ニュース' : currentQuestion.learningFocus === 'context' ? 'つながる知識' : 'まとめ読み'}</span>
        </div>
        <p className="question-type-label">{isRoundup ? '4本の情報から、1つの誤りを見抜く' : '四択クイズ'}</p>
        <h1 className="question-text">{currentQuestion.prompt}</h1>

        {currentQuestion.hint && !currentAnswer && (
          <div className="hint-block">
            {!showHint ? (
              <button className="hint-button" onClick={() => setShowHint(true)}>ヒントを見る</button>
            ) : (
              <p><strong>ヒント：</strong>{currentQuestion.hint}</p>
            )}
          </div>
        )}

        <div className={`choice-list ${isRoundup ? 'roundup-choice-list' : ''}`} role="list">
          {currentQuestion.choices.map((choice, index) => {
            const isSelected = currentAnswer?.selectedChoiceId === choice.id;
            const isCorrect = choice.id === currentQuestion.correctChoiceId;
            const stateClass = currentAnswer
              ? isCorrect
                ? 'choice-correct'
                : isSelected
                  ? 'choice-wrong'
                  : 'choice-muted'
              : '';
            return (
              <button
                key={choice.id}
                className={`choice-button ${stateClass}`}
                onClick={() => selectChoice(choice.id)}
                disabled={Boolean(currentAnswer)}
              >
                <span className="choice-letter">{String.fromCharCode(65 + index)}</span>
                <span>{choice.text}</span>
                {currentAnswer && isCorrect && <span className="choice-mark">{isRoundup ? '誤り' : '正解'}</span>}
                {currentAnswer && !isCorrect && isRoundup && <span className="choice-mark choice-mark-fact">事実</span>}
                {currentAnswer && !isCorrect && isSelected && !isRoundup && <span className="choice-mark choice-mark-wrong">あなたの回答</span>}
              </button>
            );
          })}
        </div>
      </section>

      {currentAnswer && (
        <section ref={answerPanelRef} className={`answer-panel ${currentAnswer.isCorrect ? 'answer-correct' : 'answer-wrong'}`} aria-live="polite">
          <div className="answer-status">
            <span className="answer-symbol">{currentAnswer.isCorrect ? '○' : '×'}</span>
            <div>
              <p className="eyebrow">{currentAnswer.isCorrect ? '正解' : '不正解'}</p>
              <h2>{currentAnswer.isCorrect ? '知識が一段つながった。' : 'ここでつながれば、次は強い。'}</h2>
            </div>
          </div>

          <div className="answer-meta">
            <span>回答 {formatDurationLong(currentAnswer.answerTimeMs)}</span>
            {hintWasUsed && <span>ヒント使用</span>}
          </div>

          <div className="explanation-section quick-explanation">
            <h3>まずここだけ</h3>
            <p>{currentQuestion.shortExplanation}</p>
          </div>

          {isRoundup && (
            <div className="roundup-answer-list">
              <h3>4本をまとめて確認</h3>
              <div className="roundup-fact-grid">
                {currentQuestion.choices.map((choice, index) => {
                  const isFalse = choice.id === currentQuestion.correctChoiceId;
                  return (
                    <article className={`roundup-fact-card ${isFalse ? 'is-false' : 'is-fact'}`} key={choice.id}>
                      <div><span>{String.fromCharCode(65 + index)}</span><strong>{isFalse ? '誤り' : '事実'}</strong></div>
                      <p>{choice.explanation}</p>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          <div className="answer-quick-actions">
            <button className="detail-toggle-button" onClick={() => setShowDetails((current) => !current)} aria-expanded={showDetails} aria-controls={`details-${currentQuestion.id}`}>
              {showDetails ? '詳しい解説を閉じる' : '選択肢と背景を詳しく見る'}
            </button>
            <button className={`bookmark-button ${currentAnswer.bookmarked ? 'is-bookmarked' : ''}`} onClick={toggleBookmark}>
              {currentAnswer.bookmarked ? '★ 復習に追加済み' : '☆ 復習に追加'}
            </button>
          </div>

          {showDetails && (
            <div className="answer-details" id={`details-${currentQuestion.id}`}>
              {!isRoundup && (
                <div className="explanation-section">
                  <h3>選択肢の見分け方</h3>
                  <div className="choice-explanations">
                    {currentQuestion.choices.map((choice, index) => (
                      <div key={choice.id} className={`choice-explanation ${choice.id === currentQuestion.correctChoiceId ? 'is-correct' : ''}`}>
                        <span>{String.fromCharCode(65 + index)}</span>
                        <p>{choice.explanation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {currentQuestion.background && (
                <div className="explanation-section">
                  <h3>ニュースにつながる背景</h3>
                  <p>{currentQuestion.background}</p>
                </div>
              )}

              {currentQuestion.keywords.length > 0 && (
                <div className="explanation-section">
                  <h3>重要ワード</h3>
                  <div className="keyword-list">
                    {currentQuestion.keywords.map((keyword) => (
                      <a
                        className="keyword-card"
                        key={keyword.term}
                        href={`https://www.google.com/search?q=${encodeURIComponent(keyword.searchQuery || keyword.term)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <strong>{keyword.term}</strong>
                        <span>{keyword.shortDefinition}</span>
                        <small>Googleで調べる ↗</small>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {currentQuestion.sources.length > 0 && (
                <div className="explanation-section source-section">
                  <h3>出典</h3>
                  <div className="source-list">
                    {currentQuestion.sources.map((source) => (
                      <a href={source.url} target="_blank" rel="noreferrer" key={`${source.name}-${source.url}`}>
                        <strong>{source.name}</strong>{source.title ? `｜${source.title}` : ''} ↗
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {currentAnswer && (
        <div className="quiz-sticky-action">
          <button className="primary-button sticky-next-button" onClick={moveNext}>{nextLabel}</button>
        </div>
      )}
    </main>
  );
}
