import { useMemo, useState } from 'react';
import type { Article } from '../types';
import type { ComprehensionBuilderState } from '../lib/appViewState';

interface ComprehensionExamBuilderProps {
  articles: Article[];
  onClose: () => void;
  onLaunch: (state: ComprehensionBuilderState) => void;
}

type BuilderStep = 'preset' | 'scope' | 'options';
type DifficultyTarget = 'standard' | 'challenging';

const PRESET_ORDER: ComprehensionBuilderState['preset'][] = ['quiz', 'midterm', 'final'];
const MIN_SOURCE_SELECTION = 2;
const MAX_SOURCE_SELECTION = 6;

function getGroupPools(articles: Article[]): Map<string, Article[]> {
  const map = new Map<string, Article[]>();
  for (const article of articles) {
    if (!article.group) continue;
    const list = map.get(article.group);
    if (list) {
      list.push(article);
    } else {
      map.set(article.group, [article]);
    }
  }
  return map;
}

export function ComprehensionExamBuilder({ articles, onClose, onLaunch }: ComprehensionExamBuilderProps) {
  const [step, setStep] = useState<BuilderStep>('preset');
  const [preset, setPreset] = useState<ComprehensionBuilderState['preset']>('quiz');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedArticleIds, setSelectedArticleIds] = useState<string[]>([]);
  const [difficultyTarget, setDifficultyTarget] = useState<DifficultyTarget>('standard');
  const [openBookSynthesis, setOpenBookSynthesis] = useState(true);

  const groupPools = useMemo(() => getGroupPools(articles), [articles]);
  const groupedPools = useMemo(
    () => Array.from(groupPools.entries())
      .filter(([, items]) => items.length >= MIN_SOURCE_SELECTION)
      .map(([group, items]) => ({
        group,
        items,
      })),
    [groupPools]
  );
  const useGroupSelection = groupedPools.length > 0;

  const availableArticles = useMemo(() => {
    if (!useGroupSelection || !selectedGroup) {
      return [...articles].sort((a, b) => a.title.localeCompare(b.title));
    }
    return groupPools.get(selectedGroup)?.slice().sort((a, b) => a.title.localeCompare(b.title)) ?? [];
  }, [articles, groupPools, selectedGroup, useGroupSelection]);

  const selectedCount = selectedArticleIds.length;
  const canProceedFromScope = selectedCount >= MIN_SOURCE_SELECTION && selectedCount <= MAX_SOURCE_SELECTION
    && (!useGroupSelection || Boolean(selectedGroup));

  const toggleSelection = (articleId: string) => {
    setSelectedArticleIds((previous) => {
      if (previous.includes(articleId)) {
        return previous.filter((id) => id !== articleId);
      }
      if (previous.length >= MAX_SOURCE_SELECTION) return previous;
      return [...previous, articleId];
    });
  };

  const selectedArticles = articles.filter((article) => selectedArticleIds.includes(article.id));
  const selectedGroupTitle = selectedGroup ? `Group: ${selectedGroup}` : 'None';

  const launchExam = () => {
    if (!canProceedFromScope) return;
    onLaunch({
      sourceArticleIds: selectedArticleIds.slice(0, MAX_SOURCE_SELECTION),
      preset,
      difficultyTarget,
      openBookSynthesis,
    });
  };

  if (step === 'preset') {
    return (
      <div className="comprehension-check">
        <h2>Build Exam</h2>
        <p className="comprehension-meta">Step 1 of 3 · Choose a preset</p>

        <div className="comprehension-results-chips">
          {PRESET_ORDER.map((presetName) => (
            <button
              key={presetName}
              className={`settings-preset${preset === presetName ? ' settings-preset-active' : ''}`}
              onClick={() => setPreset(presetName)}
            >
              {presetName}
            </button>
          ))}
        </div>

        <div className="comprehension-actions">
          <button className="control-btn" onClick={() => setStep('scope')}>
            Next
          </button>
          <button className="control-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    );
  }

  if (step === 'scope') {
    return (
      <div className="comprehension-check">
        <h2>Build Exam</h2>
        <p className="comprehension-meta">Step 2 of 3 · Select {MIN_SOURCE_SELECTION}–{MAX_SOURCE_SELECTION} sources</p>

        {useGroupSelection && (
          <div className="comprehension-results-chips">
            <p className="comprehension-summary">Select one group first (for cross-chapter depth):</p>
            {groupedPools.map((groupPool) => (
              <button
                key={groupPool.group}
                className={`settings-preset${selectedGroup === groupPool.group ? ' settings-preset-active' : ''}`}
                onClick={() => {
                  setSelectedGroup(groupPool.group);
                  setSelectedArticleIds([]);
                }}
              >
                {groupPool.group} ({groupPool.items.length})
              </button>
            ))}
          </div>
        )}

        <div className="comprehension-results">
          {availableArticles.map((article) => (
            <label key={article.id} className="comprehension-option">
              <input
                type="checkbox"
                checked={selectedArticleIds.includes(article.id)}
                onChange={() => toggleSelection(article.id)}
                disabled={!selectedArticleIds.includes(article.id) && selectedCount >= MAX_SOURCE_SELECTION}
              />
              <span>{article.title}</span>
              {' '}
              {article.group ? `(${article.group})` : ''}
            </label>
          ))}
        </div>

        <p className="comprehension-summary">
          Selected: {selectedCount}
          {' '}
          (minimum {MIN_SOURCE_SELECTION}, maximum {MAX_SOURCE_SELECTION})
        </p>

        <div className="comprehension-actions">
          <button className="control-btn" onClick={() => setStep('preset')}>Back</button>
          <button
            className="control-btn"
            onClick={() => setStep('options')}
            disabled={!canProceedFromScope}
          >
            Next
          </button>
          <button className="control-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="comprehension-check">
      <h2>Build Exam</h2>
      <p className="comprehension-meta">Step 3 of 3 · Finalize options</p>

      <div className="comprehension-results-chips">
        <button
          className={`settings-preset${difficultyTarget === 'standard' ? ' settings-preset-active' : ''}`}
          onClick={() => setDifficultyTarget('standard')}
        >
          Standard
        </button>
        <button
          className={`settings-preset${difficultyTarget === 'challenging' ? ' settings-preset-active' : ''}`}
          onClick={() => setDifficultyTarget('challenging')}
        >
          Challenging
        </button>
      </div>

      <label className="comprehension-option">
        <input
          type="checkbox"
          checked={openBookSynthesis}
          onChange={(event) => setOpenBookSynthesis(event.target.checked)}
        />
        Enable open-book synthesis questions
      </label>

      <div className="comprehension-summary">
        Preset: {preset} · Difficulty: {difficultyTarget} · Group: {selectedGroupTitle}
      </div>
      <div className="comprehension-summary">
        Selected sources: {selectedArticles.map((article) => article.title).join(', ')}
      </div>

      <div className="comprehension-actions">
        <button className="control-btn" onClick={() => setStep('scope')}>Back</button>
        <button className="control-btn" onClick={launchExam}>Start Exam</button>
        <button className="control-btn" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
