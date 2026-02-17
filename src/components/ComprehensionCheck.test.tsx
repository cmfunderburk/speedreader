import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { ComprehensionCheck } from './ComprehensionCheck';
import type { ComprehensionAdapter } from '../lib/comprehensionAdapter';
import type { Article, GeneratedComprehensionCheck } from '../types';
import type { ActiveComprehensionContext } from '../lib/appViewState';

function makeArticle(): Article {
  return {
    id: 'a1',
    title: 'Test Article',
    content: 'This is a sample passage used for comprehension testing.',
    source: 'test',
    addedAt: 1,
    readPosition: 0,
    isRead: false,
  };
}

function makeArticleWithContent(id: string, title: string, content: string): Article {
  return {
    id,
    title,
    content,
    source: 'test',
    addedAt: 1,
    readPosition: 0,
    isRead: false,
  };
}

function makeComprehensionContext(overrides: Partial<ActiveComprehensionContext> = {}): ActiveComprehensionContext {
  return {
    runMode: 'quick-check',
    sourceArticleIds: ['a1'],
    ...overrides,
  };
}

describe('ComprehensionCheck', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    localStorage.clear();
  });

  it('runs generation -> answer -> scoring flow and persists attempt', async () => {
    const generated: GeneratedComprehensionCheck = {
      questions: [
        {
          id: 'q1',
          dimension: 'factual',
          format: 'multiple-choice',
          prompt: 'What is this passage used for?',
          options: ['Decoration', 'Comprehension testing', 'Poetry', 'Advertising'],
          correctOptionIndex: 1,
          modelAnswer: 'It is used for comprehension testing.',
        },
        {
          id: 'q2',
          dimension: 'inference',
          format: 'short-answer',
          prompt: 'What does this imply about the check?',
          modelAnswer: 'It implies the check is passage-grounded.',
        },
        {
          id: 'q3',
          dimension: 'evaluative',
          format: 'essay',
          prompt: 'Is this a useful test passage and why?',
          modelAnswer: 'It is useful because it is concise and explicit.',
        },
      ],
    };

    const adapter: ComprehensionAdapter = {
      generateCheck: vi.fn(async () => generated),
      generateExam: vi.fn(),
      scoreAnswer: vi.fn(async () => ({
        score: 2,
        feedback: 'Reasonable answer with one omission.',
      })),
    };

    render(
      <ComprehensionCheck
        article={makeArticle()}
        entryPoint="launcher"
        adapter={adapter}
        onClose={() => {}}
        sourceArticles={[makeArticle()]}
        comprehension={makeComprehensionContext()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Question 1 of 3/i)).toBeTruthy();
    });
    expect(screen.getByText(/Closed-book phase/i)).toBeTruthy();
    expect(screen.queryByText('Show passage')).toBeNull();

    fireEvent.click(screen.getByLabelText('Comprehension testing'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(screen.getByText(/Question 2 of 3/i)).toBeTruthy();
    });
    expect(screen.getByText(/Open-book phase/i)).toBeTruthy();
    expect(screen.getByText('Show passage')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('Write a short answer'), {
      target: { value: 'It is grounded in a specific passage.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.change(screen.getByPlaceholderText('Write your response'), {
      target: { value: 'Yes, because it is clear and focused.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(screen.getByText(/Comprehension Check Results/i)).toBeTruthy();
    });

    const stored = JSON.parse(localStorage.getItem('speedread_comprehension_attempts') || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      articleId: 'a1',
      articleTitle: 'Test Article',
      entryPoint: 'launcher',
    });
    expect(stored[0].questions).toHaveLength(3);
    expect(adapter.scoreAnswer).toHaveBeenCalledTimes(2);
  });

  it('shows missing-key prompt with open-settings action', async () => {
    const onOpenSettings = vi.fn();
    const adapter: ComprehensionAdapter = {
      generateCheck: vi.fn(async () => {
        throw new Error('Comprehension check requires an API key');
      }),
      generateExam: vi.fn(),
      scoreAnswer: vi.fn(async () => ({ score: 0, feedback: '' })),
    };

    render(
      <ComprehensionCheck
        article={makeArticle()}
        entryPoint="launcher"
        adapter={adapter}
        onClose={() => {}}
        onOpenSettings={onOpenSettings}
        sourceArticles={[makeArticle()]}
        comprehension={makeComprehensionContext()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/requires an API key/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('requires true-false explanation and scores both choice and explanation', async () => {
    const generated: GeneratedComprehensionCheck = {
      questions: [
        {
          id: 'tf-1',
          dimension: 'factual',
          format: 'true-false',
          prompt: 'True or False: the passage is used for comprehension testing. Explain in <= 2 sentences.',
          correctAnswer: true,
          modelAnswer: 'True. The passage explicitly states it is used for comprehension testing.',
        },
      ],
    };

    const adapter: ComprehensionAdapter = {
      generateCheck: vi.fn(async () => generated),
      generateExam: vi.fn(),
      scoreAnswer: vi.fn(async () => ({
        score: 3,
        feedback: 'Accurate choice and concise, coherent explanation.',
      })),
    };

    render(
      <ComprehensionCheck
        article={makeArticle()}
        entryPoint="launcher"
        adapter={adapter}
        onClose={() => {}}
        sourceArticles={[makeArticle()]}
        comprehension={makeComprehensionContext()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Question 1 of 1/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByLabelText('True'));
    fireEvent.change(screen.getByPlaceholderText('Explain your answer in no more than 2 sentences.'), {
      target: { value: 'The passage states this directly.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(screen.getByText(/Comprehension Check Results/i)).toBeTruthy();
    });

    expect(adapter.scoreAnswer).toHaveBeenCalledTimes(1);
    expect(adapter.scoreAnswer).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ id: 'tf-1' }),
      expect.stringContaining('True/False selection: True')
    );

    const stored = JSON.parse(localStorage.getItem('speedread_comprehension_attempts') || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].questions[0]).toMatchObject({
      id: 'tf-1',
      score: 3,
      userAnswer: 'True. The passage states this directly.',
    });
  });

  it('caps true-false explanation score when explanation exceeds 2 sentences', async () => {
    const generated: GeneratedComprehensionCheck = {
      questions: [
        {
          id: 'tf-cap',
          dimension: 'factual',
          format: 'true-false',
          prompt: 'True or False: the passage is sample content. Explain in <= 2 sentences.',
          correctAnswer: true,
          modelAnswer: 'True. It says it is a sample passage.',
        },
      ],
    };

    const adapter: ComprehensionAdapter = {
      generateCheck: vi.fn(async () => generated),
      generateExam: vi.fn(),
      scoreAnswer: vi.fn(async () => ({
        score: 3,
        feedback: 'Strong explanation.',
      })),
    };

    render(
      <ComprehensionCheck
        article={makeArticle()}
        entryPoint="launcher"
        adapter={adapter}
        onClose={() => {}}
        sourceArticles={[makeArticle()]}
        comprehension={makeComprehensionContext()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Question 1 of 1/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByLabelText('True'));
    fireEvent.change(screen.getByPlaceholderText('Explain your answer in no more than 2 sentences.'), {
      target: { value: 'Sentence one. Sentence two. Sentence three.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(screen.getByText(/Comprehension Check Results/i)).toBeTruthy();
    });

    const stored = JSON.parse(localStorage.getItem('speedread_comprehension_attempts') || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].questions[0].score).toBe(2);
  });

  it('assigns zero for wrong true-false choice without calling explanation scoring', async () => {
    const generated: GeneratedComprehensionCheck = {
      questions: [
        {
          id: 'tf-wrong',
          dimension: 'factual',
          format: 'true-false',
          prompt: 'True or False: the passage is unrelated to testing. Explain in <= 2 sentences.',
          correctAnswer: false,
          modelAnswer: 'False. It is explicitly about comprehension testing.',
        },
      ],
    };

    const adapter: ComprehensionAdapter = {
      generateCheck: vi.fn(async () => generated),
      generateExam: vi.fn(),
      scoreAnswer: vi.fn(async () => ({
        score: 3,
        feedback: 'Should not be used.',
      })),
    };

    render(
      <ComprehensionCheck
        article={makeArticle()}
        entryPoint="launcher"
        adapter={adapter}
        onClose={() => {}}
        sourceArticles={[makeArticle()]}
        comprehension={makeComprehensionContext()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Question 1 of 1/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByLabelText('True'));
    fireEvent.change(screen.getByPlaceholderText('Explain your answer in no more than 2 sentences.'), {
      target: { value: 'It seems unrelated.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(screen.getByText(/Comprehension Check Results/i)).toBeTruthy();
    });

    expect(adapter.scoreAnswer).toHaveBeenCalledTimes(0);
    const stored = JSON.parse(localStorage.getItem('speedread_comprehension_attempts') || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].questions[0]).toMatchObject({
      id: 'tf-wrong',
      score: 0,
    });
  });

  it('limits concurrent free-response scoring requests', async () => {
    const generated: GeneratedComprehensionCheck = {
      questions: [
        { id: 'q1', dimension: 'factual', format: 'short-answer', prompt: 'Q1?', modelAnswer: 'A1' },
        { id: 'q2', dimension: 'inference', format: 'short-answer', prompt: 'Q2?', modelAnswer: 'A2' },
        { id: 'q3', dimension: 'structural', format: 'short-answer', prompt: 'Q3?', modelAnswer: 'A3' },
        { id: 'q4', dimension: 'evaluative', format: 'short-answer', prompt: 'Q4?', modelAnswer: 'A4' },
      ],
    };

    let activeRequests = 0;
    let maxActiveRequests = 0;

    const adapter: ComprehensionAdapter = {
      generateCheck: vi.fn(async () => generated),
      generateExam: vi.fn(),
      scoreAnswer: vi.fn(async () => {
        activeRequests += 1;
        maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
        await new Promise((resolve) => setTimeout(resolve, 10));
        activeRequests -= 1;
        return {
          score: 2,
          feedback: 'Scored',
        };
      }),
    };

    render(
      <ComprehensionCheck
        article={makeArticle()}
        entryPoint="launcher"
        adapter={adapter}
        onClose={() => {}}
        sourceArticles={[makeArticle()]}
        comprehension={makeComprehensionContext()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Question 1 of 4/i)).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText('Write a short answer'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.change(screen.getByPlaceholderText('Write a short answer'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.change(screen.getByPlaceholderText('Write a short answer'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.change(screen.getByPlaceholderText('Write a short answer'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(screen.getByText(/Comprehension Check Results/i)).toBeTruthy();
    });

    expect(adapter.scoreAnswer).toHaveBeenCalledTimes(4);
    expect(maxActiveRequests).toBeLessThanOrEqual(2);
  });

  it('shows raw API-key errors and does not treat them as missing-key', async () => {
    const onOpenSettings = vi.fn();
    const adapter: ComprehensionAdapter = {
      generateCheck: vi.fn(async () => {
        throw new Error('Gemini request failed (400): API key not valid. Please pass a valid API key.');
      }),
      generateExam: vi.fn(),
      scoreAnswer: vi.fn(async () => ({ score: 0, feedback: '' })),
    };

    render(
      <ComprehensionCheck
        article={makeArticle()}
        entryPoint="launcher"
        adapter={adapter}
        onClose={() => {}}
        onOpenSettings={onOpenSettings}
        sourceArticles={[makeArticle()]}
        comprehension={makeComprehensionContext()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/API key not valid/i)).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: 'Open Settings' })).toBeNull();
    expect(onOpenSettings).toHaveBeenCalledTimes(0);
  });

  it('shows a friendly error when exam generation returns malformed structure', async () => {
    const sourceA = makeArticleWithContent('a1', 'Source A', 'Passage A');
    const sourceB = makeArticleWithContent('a2', 'Source B', 'Passage B');
    const adapter: ComprehensionAdapter = {
      generateCheck: vi.fn(),
      generateExam: vi.fn(async () => {
        throw new Error('Exam item 0 is missing required fields');
      }),
      scoreAnswer: vi.fn(async () => ({ score: 0, feedback: '' })),
    };

    render(
      <ComprehensionCheck
        article={sourceA}
        entryPoint="launcher"
        adapter={adapter}
        onClose={() => {}}
        sourceArticles={[sourceA, sourceB]}
        comprehension={makeComprehensionContext({
          runMode: 'exam',
          sourceArticleIds: ['a1', 'a2'],
          examPreset: 'quiz',
          difficultyTarget: 'standard',
          openBookSynthesis: true,
        })}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Could not generate a valid exam this time/i)).toBeTruthy();
    });
    expect(screen.getByText('Technical details')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('supports review depth controls and deduplicates repeated explanation text', async () => {
    const generated: GeneratedComprehensionCheck = {
      questions: [
        {
          id: 'q1',
          dimension: 'factual',
          format: 'multiple-choice',
          prompt: 'Which option is correct?',
          options: ['Wrong', 'Right', 'Other', 'Also wrong'],
          correctOptionIndex: 1,
          modelAnswer: 'Right is correct based on the passage.',
        },
      ],
    };
    const adapter: ComprehensionAdapter = {
      generateCheck: vi.fn(async () => generated),
      generateExam: vi.fn(),
      scoreAnswer: vi.fn(async () => ({ score: 0, feedback: '' })),
    };

    render(
      <ComprehensionCheck
        article={makeArticle()}
        entryPoint="launcher"
        adapter={adapter}
        onClose={() => {}}
        sourceArticles={[makeArticle()]}
        comprehension={makeComprehensionContext()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Question 1 of 1/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByLabelText('Wrong'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(screen.getByText(/Comprehension Check Results/i)).toBeTruthy();
    });

    expect(screen.getByRole('button', { name: 'Quick' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Standard' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Deep' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Standard' }));
    expect(screen.getByText(/Explanation:/i)).toBeTruthy();
    expect(screen.queryByText(/Model answer:/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Deep' }));
    expect(screen.getByText(/Feedback \/ model answer:/i)).toBeTruthy();
  });

  it('renders exam question passages from the selected source article', async () => {
    const sourceA = makeArticleWithContent('a1', 'Source A', 'Passage A for exam context.');
    const sourceB = makeArticleWithContent('a2', 'Source B', 'Passage B for interpretation section.');

    const generated: GeneratedComprehensionCheck = {
      questions: [
        {
          id: 'q1',
          dimension: 'factual',
          format: 'short-answer',
          section: 'interpretation',
          sourceArticleId: 'a2',
          prompt: 'Which source covers interpretation?',
          modelAnswer: 'Source B should be used.',
        },
      ],
    };

    const adapter: ComprehensionAdapter = {
      generateCheck: vi.fn(),
      generateExam: vi.fn(async () => generated),
      scoreAnswer: vi.fn(async () => ({ score: 2, feedback: 'Reasonable' })),
    };

    render(
      <ComprehensionCheck
        article={sourceA}
        entryPoint="launcher"
        adapter={adapter}
        onClose={() => {}}
        sourceArticles={[sourceA, sourceB]}
        comprehension={makeComprehensionContext({
          runMode: 'exam',
          sourceArticleIds: ['a1', 'a2'],
          examPreset: 'quiz',
          difficultyTarget: 'standard',
          openBookSynthesis: true,
        })}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Question 1 of 1/i)).toBeTruthy();
    });
    expect(screen.getByText(/Open-book phase/i)).toBeTruthy();
    expect(screen.getByText('Show passage')).toBeTruthy();

    fireEvent.click(screen.getByText('Show passage'));
    expect(screen.getByText('Passage B for interpretation section.')).toBeTruthy();
    expect(screen.queryByText('Passage A for exam context.')).toBeNull();
  });

  it('keeps synthesis questions closed-book when open-book synthesis is disabled', async () => {
    const sourceA = makeArticleWithContent('a1', 'Source A', 'Passage A for exam context.');
    const sourceB = makeArticleWithContent('a2', 'Source B', 'Passage B for synthesis section.');

    const generated: GeneratedComprehensionCheck = {
      questions: [
        {
          id: 'q-syn',
          dimension: 'evaluative',
          format: 'short-answer',
          section: 'synthesis',
          sourceArticleId: 'a2',
          prompt: 'Synthesize the argument across chapters.',
          modelAnswer: 'Synthesis answer.',
        },
      ],
    };

    const adapter: ComprehensionAdapter = {
      generateCheck: vi.fn(),
      generateExam: vi.fn(async () => generated),
      scoreAnswer: vi.fn(async () => ({ score: 2, feedback: 'Reasonable' })),
    };

    render(
      <ComprehensionCheck
        article={sourceA}
        entryPoint="launcher"
        adapter={adapter}
        onClose={() => {}}
        sourceArticles={[sourceA, sourceB]}
        comprehension={makeComprehensionContext({
          runMode: 'exam',
          sourceArticleIds: ['a1', 'a2'],
          examPreset: 'quiz',
          difficultyTarget: 'standard',
          openBookSynthesis: false,
        })}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Question 1 of 1/i)).toBeTruthy();
    });
    expect(screen.getByText(/Closed-book phase/i)).toBeTruthy();
    expect(screen.queryByText('Show passage')).toBeNull();
  });

  it('does not regenerate exam after submit when parent rerenders with equivalent sources', async () => {
    const sourceA = makeArticleWithContent('a1', 'Source A', 'Passage A');
    const sourceB = makeArticleWithContent('a2', 'Source B', 'Passage B');
    const generated: GeneratedComprehensionCheck = {
      questions: [
        {
          id: 'q1',
          dimension: 'factual',
          format: 'multiple-choice',
          section: 'recall',
          sourceArticleId: 'a1',
          prompt: 'Recall question?',
          options: ['A', 'B', 'C', 'D'],
          correctOptionIndex: 0,
          modelAnswer: 'A',
        },
      ],
    };

    const generateExam = vi.fn(async () => generated);
    const adapter: ComprehensionAdapter = {
      generateCheck: vi.fn(),
      generateExam,
      scoreAnswer: vi.fn(async () => ({ score: 3, feedback: 'Correct' })),
    };

    function Harness() {
      const [, setTick] = useState(0);
      const rebuiltSources = [
        { ...sourceA },
        { ...sourceB },
      ];
      return (
        <ComprehensionCheck
          article={rebuiltSources[0]}
          entryPoint="launcher"
          adapter={adapter}
          onClose={() => {}}
          onAttemptSaved={() => setTick((tick) => tick + 1)}
          sourceArticles={rebuiltSources}
          comprehension={makeComprehensionContext({
            runMode: 'exam',
            sourceArticleIds: ['a1', 'a2'],
            examPreset: 'quiz',
            difficultyTarget: 'standard',
            openBookSynthesis: true,
          })}
        />
      );
    }

    render(<Harness />);

    await waitFor(() => {
      expect(screen.getByText(/Question 1 of 1/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByLabelText('A'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(screen.getByText(/Comprehension Check Results/i)).toBeTruthy();
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(generateExam).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Generating/i)).toBeNull();
  });
});
