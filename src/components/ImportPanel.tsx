import { useRef, useState } from 'react';
import type { QuizSet, ValidationResult } from '../types';
import { validateQuizSet } from '../lib/validation';

interface ImportPanelProps {
  onImportAndStart: (quizSet: QuizSet) => Promise<void>;
}

const sample = `{
  "schemaVersion": 1,
  "id": "20260704-example",
  "title": "今日のニュース30問",
  "mode": "balanced",
  "createdAt": "2026-07-04T00:00:00.000Z",
  "validAsOf": "2026-07-04",
  "questionBalance": { "direct": 21, "context": 6, "roundup": 3 },
  "questions": [ ... ]
}`;

export function ImportPanel({ onImportAndStart }: ImportPanelProps) {
  const [text, setText] = useState('');
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const inspect = (value = text) => {
    setMessage('');
    if (!value.trim()) {
      setValidation({ valid: false, errors: ['JSONを貼り付けてください。'], warnings: [] });
      return;
    }
    try {
      const result = validateQuizSet(JSON.parse(value));
      setValidation(result);
    } catch (error) {
      const detail = error instanceof Error ? error.message : '不明なエラー';
      setValidation({ valid: false, errors: [`JSONとして読み込めません：${detail}`], warnings: [] });
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      setText(clipText);
      inspect(clipText);
    } catch {
      setMessage('クリップボードを読み取れませんでした。下の欄に直接貼り付けてください。');
    }
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    try {
      const content = await file.text();
      setText(content);
      inspect(content);
    } catch {
      setMessage('ファイルを読み込めませんでした。UTF-8のJSONファイルか確認してください。');
    }
  };

  const saveAndStart = async () => {
    if (!validation?.valid || !validation.quizSet) return;
    setIsSaving(true);
    setMessage(`「${validation.quizSet.title}」を取り込み中です…`);
    try {
      await onImportAndStart(validation.quizSet);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '取り込みに失敗しました。');
      setIsSaving(false);
    }
  };

  return (
    <main className="page-shell">
      <section className="page-header">
        <p className="section-kicker">IMPORT JSON</p>
        <h1>問題セットを取り込む</h1>
        <p>ChatGPTなどで生成したJSONを貼り付けるだけ。問題数、四択、正解、出典を取り込み前に検査します。</p>
      </section>

      <section className="import-card">
        <div className="import-actions">
          <button className="secondary-button" onClick={pasteFromClipboard}>クリップボードから貼り付け</button>
          <button className="secondary-button" onClick={() => fileInputRef.current?.click()}>JSONファイルを選ぶ</button>
          <input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={(event) => handleFile(event.target.files?.[0])} />
        </div>
        <label className="field-label" htmlFor="quiz-json">JSON</label>
        <textarea
          id="quiz-json"
          className="json-textarea"
          value={text}
          placeholder={sample}
          onChange={(event) => setText(event.target.value)}
          spellCheck="false"
        />
        <div className="import-footer">
          <button className="secondary-button" onClick={() => inspect()}>JSONを検査</button>
          <button className="primary-button" onClick={saveAndStart} disabled={!validation?.valid || isSaving}>{isSaving ? '取り込んで開始中…' : '取り込んで、すぐ始める'}</button>
        </div>
      </section>

      {message && <p className="notice-message" role="status">{message}</p>}

      {validation && (
        <section className={`validation-card ${validation.valid ? 'validation-ok' : 'validation-error'}`}>
          <div className="validation-title"><span>{validation.valid ? '✓' : '!'}</span><div><h2>{validation.valid ? '取り込み可能' : '修正が必要'}</h2><p>{validation.valid ? '形式は問題ありません。警告だけ確認して、そのままクイズを始められます。' : '下記のエラーを直すと取り込めます。'}</p></div></div>
          {validation.errors.length > 0 && <div className="validation-list"><h3>エラー</h3><ul>{validation.errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
          {validation.warnings.length > 0 && <div className="validation-list warning-list"><h3>確認推奨</h3><ul>{validation.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
          {validation.valid && validation.quizSet && <div className="import-preview"><strong>{validation.quizSet.title}</strong><span>{validation.quizSet.questions.length}問｜主題 {validation.quizSet.questionBalance.direct}／背景 {validation.quizSet.questionBalance.context}／まとめ読み {validation.quizSet.questionBalance.roundup}</span></div>}
        </section>
      )}

      <section className="guide-card">
        <h2>取り込み前に守ること</h2>
        <ul>
          <li>ニュース問題には<strong>情報基準日と出典URL</strong>を入れる。</li>
          <li>選択肢は必ず<strong>4つ</strong>。正解は<strong>1つ</strong>にする。</li>
          <li>「事実と異なるもの」形式は、3つの正しい情報にも各選択肢の解説を付ける。</li>
          <li>同じIDのセットを取り込むと、内容を更新する。過去の解答履歴は残る。</li>
        </ul>
      </section>
    </main>
  );
}
