import { useMemo, useState } from 'react';
import type { CategoryId, PromptSettings } from '../types';
import { CATEGORY_META } from '../types';
import { buildPrompt, getBalancedMixPreview, getDistribution, getNewsFreshnessPreview } from '../lib/prompt';

interface PromptBuilderProps {
  settings: PromptSettings;
  onSettingsChange: (settings: PromptSettings) => void;
}

const counts = [10, 20, 30, 50];
const categoryIds = Object.keys(CATEGORY_META) as CategoryId[];

export function PromptBuilder({ settings, onSettingsChange }: PromptBuilderProps) {
  const [copied, setCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const prompt = useMemo(() => buildPrompt(settings), [settings]);
  const distribution = useMemo(() => getDistribution(settings), [settings]);
  const balancedMix = useMemo(() => getBalancedMixPreview(settings), [settings]);
  const newsFreshness = useMemo(() => getNewsFreshnessPreview(settings), [settings]);

  const patch = (update: Partial<PromptSettings>) => onSettingsChange({ ...settings, ...update });

  const switchMode = (mode: 'balanced' | 'theme') => {
    onSettingsChange({
      ...settings,
      mode,
      directRatio: mode === 'theme' ? 80 : 70,
      roundupCount: mode === 'theme' ? 2 : 3,
    });
  };

  const toggleCategory = (category: CategoryId) => {
    const active = settings.categories.includes(category);
    const categories = active
      ? settings.categories.filter((item) => item !== category)
      : [...settings.categories, category];
    patch({ categories: categories.length ? categories : settings.categories });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      const textarea = document.querySelector<HTMLTextAreaElement>('#generated-prompt');
      textarea?.focus();
      textarea?.select();
      document.execCommand('copy');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  const primaryMixLabel = settings.mode === 'theme' && settings.theme.trim()
    ? `テーマ中心 ${distribution.direct}問`
    : `ニュース ${distribution.direct}問`;

  return (
    <main className="page-shell">
      <section className="page-header">
        <p className="section-kicker">PROMPT BUILDER</p>
        <h1>今日の問題を、AIに作らせる</h1>
        <p>まずは条件を選んでコピーするだけ。細かい配分は、必要なときだけ調整できます。</p>
      </section>

      <section className="builder-card quick-builder-card">
        <div className="quick-builder-heading">
          <div><p className="section-kicker">QUICK CREATE</p><h2>かんたん作成</h2></div>
          <span>標準設定済み</span>
        </div>

        <div className="mode-switch" role="group" aria-label="出題モード">
          <button className={settings.mode === 'balanced' ? 'is-active' : ''} onClick={() => switchMode('balanced')}><strong>おまかせバランス</strong><small>国内外ニュース・スポーツ・芸能を混ぜる</small></button>
          <button className={settings.mode === 'theme' ? 'is-active' : ''} onClick={() => switchMode('theme')}><strong>テーマ深掘り</strong><small>主題を中心に、背景は少しだけ</small></button>
        </div>

        {settings.mode === 'theme' && (
          <div className="field-group theme-field">
            <label className="field-label" htmlFor="theme">今回のテーマ</label>
            <input id="theme" value={settings.theme} onChange={(event) => patch({ theme: event.target.value })} placeholder="例：FIFAワールドカップの開催国・注目チーム・大会制度" />
            <small>テーマが空欄なら、おまかせバランスとして作成します。</small>
          </div>
        )}

        <div className="field-group">
          <span className="field-label">問題数</span>
          <div className="count-options">
            {counts.map((count) => <button key={count} onClick={() => patch({ questionCount: count })} className={settings.questionCount === count ? 'is-active' : ''}>{count}問</button>)}
          </div>
        </div>

        <div className="generation-preview" aria-label="今回の出題予定">
          <p className="section-kicker">THIS SET</p>
          <h3>今回の予定</h3>
          <div className="plan-pills">
            <span>{primaryMixLabel}</span>
            <span>つながる知識 {distribution.context}問</span>
            <span>まとめ読み {distribution.roundup}問</span>
          </div>
          <div className="freshness-plan">
            <p className="section-kicker">NEWS FRESHNESS</p>
            <ul className="mix-summary">
              {newsFreshness.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          {settings.mode === 'balanced' && balancedMix.length > 0 && (
            <ul className="mix-summary">
              {balancedMix.map((item) => <li key={item}>{item}</li>)}
            </ul>
          )}
          {settings.mode === 'theme' && settings.theme.trim() && <p className="theme-summary">「{settings.theme.trim()}」を中心にしつつ、短期ニュースは24時間以内を最優先に必ず混ぜます。</p>}
        </div>

        <button className="advanced-toggle" onClick={() => setShowAdvanced((current) => !current)} aria-expanded={showAdvanced}>
          {showAdvanced ? '− バランス調整を閉じる' : '+ バランスを調整する'}
        </button>

        {showAdvanced && (
          <div className="advanced-fields">
            <div className="field-group">
              <label className="range-label" htmlFor="direct-ratio"><span>中心テーマ・ニュースを直接問う比率</span><strong>{settings.directRatio}%</strong></label>
              <input id="direct-ratio" type="range" min="55" max="90" step="5" value={settings.directRatio} onChange={(event) => patch({ directRatio: Number(event.target.value) })} />
              <small>{primaryMixLabel} ／ つながる知識 {distribution.context}問 ／ まとめ読み {distribution.roundup}問</small>
            </div>

            <div className="field-group">
              <label className="range-label" htmlFor="roundup-count"><span>「3本本当＋1本うそ」問題</span><strong>{settings.roundupCount}問</strong></label>
              <input id="roundup-count" type="range" min="0" max={settings.questionCount >= 30 ? 5 : 3} step="1" value={settings.roundupCount} onChange={(event) => patch({ roundupCount: Number(event.target.value) })} />
              <small>1問で4つの情報を比較する、まとめ学習の枠です。</small>
            </div>

            <div className="field-group">
              <span className="field-label">含めるカテゴリー</span>
              <div className="category-select-grid">
                {categoryIds.map((category) => {
                  const active = settings.categories.includes(category);
                  const meta = CATEGORY_META[category];
                  return <button key={category} className={active ? 'is-active' : ''} onClick={() => toggleCategory(category)}><span>{meta.emoji}</span>{meta.label}</button>;
                })}
              </div>
              <small>おまかせバランスでは、選んだカテゴリー内で国内外スポーツ・芸能も最低数を指定します。</small>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="valid-as-of">ニュース情報の基準日</label>
              <input id="valid-as-of" type="date" value={settings.validAsOf} onChange={(event) => patch({ validAsOf: event.target.value })} />
            </div>
          </div>
        )}
      </section>

      <section className="prompt-output-card">
        <div className="prompt-output-heading">
          <div><p className="section-kicker">GENERATED PROMPT</p><h2>コピーして、AIに渡す</h2></div>
          <button className="primary-button" onClick={copy}>{copied ? 'コピー済み ✓' : 'プロンプトをコピー'}</button>
        </div>
        <textarea id="generated-prompt" className="prompt-textarea" readOnly value={prompt} spellCheck="false" />
        <p className="prompt-footnote">AIの返答は「JSONだけ」に制限済み。返ってきたJSONは、下部メニューの「取込」にそのまま貼り付けます。</p>
      </section>
    </main>
  );
}
