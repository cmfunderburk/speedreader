import { describe, expect, it } from 'vitest';
import type { ComprehensionExamPreset } from '../types';
import {
  getComprehensionExamBlueprint,
  parseGeneratedExamResponse,
} from './comprehensionExamPrompts';

function buildContainerPayload(
  preset: ComprehensionExamPreset,
  sourceIds: string[],
  options: {
    synthesisFormat?: 'essay' | 'short-answer';
    recallOptionCount?: number;
  } = {}
): string {
  const blueprint = getComprehensionExamBlueprint(preset);
  const buckets = {
    recall: [] as Array<Record<string, unknown>>,
    interpretation: [] as Array<Record<string, unknown>>,
    synthesis: [] as Array<Record<string, unknown>>,
  };

  let itemIndex = 0;
  const pickSourceId = () => sourceIds[itemIndex % sourceIds.length];

  for (let i = 0; i < blueprint.sectionCounts.recall; i += 1) {
    const sourceId = pickSourceId();
    const recallOptionCount = options.recallOptionCount ?? 4;
    buckets.recall.push({
      id: `r-${i + 1}`,
      type: 'multiple choice',
      sourceId,
      question: `Recall prompt ${i + 1}`,
      choices: ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, recallOptionCount),
      answerIndex: '1',
      answer: 'Correct option: B',
    });
    itemIndex += 1;
  }

  for (let i = 0; i < blueprint.sectionCounts.interpretation; i += 1) {
    const sourceId = pickSourceId();
    buckets.interpretation.push({
      id: `i-${i + 1}`,
      type: 'short answer',
      sourceId,
      question: `Interpretation prompt ${i + 1}`,
      answer: `Interpretation model answer ${i + 1}`,
    });
    itemIndex += 1;
  }

  for (let i = 0; i < blueprint.sectionCounts.synthesis; i += 1) {
    const sourceId = pickSourceId();
    const synthesisFormat = options.synthesisFormat ?? 'essay';
    buckets.synthesis.push({
      id: `s-${i + 1}`,
      type: synthesisFormat === 'essay' ? 'essay' : 'short answer',
      sourceId,
      question: `Synthesis prompt ${i + 1}`,
      answer: `Synthesis model answer ${i + 1}`,
    });
    itemIndex += 1;
  }

  return JSON.stringify({
    items: [
      { section: 'recall', questions: buckets.recall },
      { section: 'interpretation', questions: buckets.interpretation },
      { section: 'synthesis', questions: buckets.synthesis },
    ],
  });
}

function buildTopLevelQuestionsPayload(questionCount: number): string {
  const items: Array<Record<string, unknown>> = [];
  for (let i = 0; i < questionCount; i += 1) {
    if (i < 3) {
      items.push({
        id: `q-${i + 1}`,
        section: 'recall',
        format: 'true-false',
        prompt: `Recall true/false ${i + 1}`,
        correctAnswer: i % 2 === 0 ? 'true' : 'false',
        modelAnswer: 'True/false explanation',
      });
    } else if (i < 8) {
      items.push({
        id: `q-${i + 1}`,
        section: 'interpretation',
        format: 'short-answer',
        prompt: `Interpretation short answer ${i + 1}`,
        modelAnswer: 'Interpretation answer',
      });
    } else {
      items.push({
        id: `q-${i + 1}`,
        section: 'synthesis',
        format: 'essay',
        prompt: `Synthesis essay ${i + 1}`,
        modelAnswer: 'Synthesis answer',
      });
    }
  }

  return JSON.stringify({ questions: items });
}

describe('comprehensionExamPrompts', () => {
  it('parses section-container exam payloads with alias keys', () => {
    const sourceIds = ['source-a', 'source-b'];
    const parsed = parseGeneratedExamResponse({
      raw: buildContainerPayload('quiz', sourceIds),
      preset: 'quiz',
      difficultyTarget: 'standard',
      selectedSourceArticleIds: sourceIds,
    });

    expect(parsed.questions).toHaveLength(12);
    expect(parsed.questions.every((question) => question.modelAnswer.length > 0)).toBe(true);
    expect(parsed.questions.some((question) => question.sourceArticleId === 'source-a')).toBe(true);
    expect(parsed.questions.some((question) => question.sourceArticleId === 'source-b')).toBe(true);
  });

  it('parses top-level questions payload and defaults source ids for single-source exams', () => {
    const parsed = parseGeneratedExamResponse({
      raw: buildTopLevelQuestionsPayload(12),
      preset: 'quiz',
      difficultyTarget: 'standard',
      selectedSourceArticleIds: ['only-source'],
    });

    expect(parsed.questions).toHaveLength(12);
    expect(parsed.questions.every((question) => question.sourceArticleId === 'only-source')).toBe(true);
    expect(parsed.questions.filter((question) => question.format === 'true-false')).toHaveLength(3);
  });

  it('parses midterm and final presets with expected counts', () => {
    const sourceIds = ['source-a', 'source-b'];
    const presets: ComprehensionExamPreset[] = ['midterm', 'final'];

    for (const preset of presets) {
      const blueprint = getComprehensionExamBlueprint(preset);
      const parsed = parseGeneratedExamResponse({
        raw: buildContainerPayload(preset, sourceIds),
        preset,
        difficultyTarget: 'standard',
        selectedSourceArticleIds: sourceIds,
      });

      expect(parsed.questions).toHaveLength(blueprint.questionCount);
      expect(parsed.questions.filter((question) => question.section === 'recall')).toHaveLength(blueprint.sectionCounts.recall);
      expect(parsed.questions.filter((question) => question.section === 'interpretation')).toHaveLength(blueprint.sectionCounts.interpretation);
      expect(parsed.questions.filter((question) => question.section === 'synthesis')).toHaveLength(blueprint.sectionCounts.synthesis);
    }
  });

  it('accepts challenging difficulty when exam includes essay questions', () => {
    const sourceIds = ['source-a', 'source-b'];
    const parsed = parseGeneratedExamResponse({
      raw: buildContainerPayload('quiz', sourceIds),
      preset: 'quiz',
      difficultyTarget: 'challenging',
      selectedSourceArticleIds: sourceIds,
    });

    expect(parsed.questions.some((question) => question.format === 'essay')).toBe(true);
  });

  it('rejects challenging difficulty when exam includes no essay questions', () => {
    const sourceIds = ['source-a', 'source-b'];

    expect(() => parseGeneratedExamResponse({
      raw: buildContainerPayload('quiz', sourceIds, { synthesisFormat: 'short-answer' }),
      preset: 'quiz',
      difficultyTarget: 'challenging',
      selectedSourceArticleIds: sourceIds,
    })).toThrowError('Challenging difficulty requires at least one essay question');
  });

  it('rejects multiple-choice recall items unless they provide exactly four options', () => {
    const sourceIds = ['source-a', 'source-b'];

    expect(() => parseGeneratedExamResponse({
      raw: buildContainerPayload('quiz', sourceIds, { recallOptionCount: 3 }),
      preset: 'quiz',
      difficultyTarget: 'standard',
      selectedSourceArticleIds: sourceIds,
    })).toThrowError('invalid multiple-choice payload');
  });
});
