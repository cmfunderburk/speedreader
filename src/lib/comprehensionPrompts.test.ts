import { describe, expect, it } from 'vitest';
import {
  buildGenerateCheckPrompt,
  buildScoreAnswerPrompt,
  parseGeneratedCheckResponse,
  parseQuestionScoreResponse,
} from './comprehensionPrompts';
import type { GeneratedComprehensionQuestion } from '../types';

const SAMPLE_PASSAGE = 'Mill argued for liberty while still respecting social limits.';

const SAMPLE_QUESTION: GeneratedComprehensionQuestion = {
  id: 'q1',
  dimension: 'inference',
  format: 'short-answer',
  prompt: 'What does this imply about Mill and social authority?',
  modelAnswer: 'He supports liberty but does not reject all social constraint.',
};

describe('comprehensionPrompts', () => {
  it('builds generation prompt with clamped question count and passage', () => {
    const prompt = buildGenerateCheckPrompt(SAMPLE_PASSAGE, 12);
    expect(prompt).toContain('Generate exactly 10 questions');
    expect(prompt).toContain('True-false prompts must explicitly ask for True/False plus a brief explanation in <= 2 sentences.');
    expect(prompt).toContain('Output formatting is enforced by a response schema supplied by the caller.');
    expect(prompt).not.toContain('Return JSON only with this exact shape');
    expect(prompt).toContain(SAMPLE_PASSAGE);
  });

  it('builds score prompt with rubric, question, and user answer', () => {
    const prompt = buildScoreAnswerPrompt(SAMPLE_PASSAGE, SAMPLE_QUESTION, 'It is a balanced view.');
    expect(prompt).toContain('Scoring rubric (0-3)');
    expect(prompt).toContain('Output formatting is enforced by a response schema supplied by the caller.');
    expect(prompt).toContain(SAMPLE_QUESTION.prompt);
    expect(prompt).toContain('It is a balanced view.');
  });

  it('adds true-false-specific grading requirements when scoring true-false', () => {
    const trueFalseQuestion: GeneratedComprehensionQuestion = {
      id: 'tf-1',
      dimension: 'factual',
      format: 'true-false',
      prompt: 'True or False: Mill rejects all social limits. Explain in <= 2 sentences.',
      correctAnswer: false,
      modelAnswer: 'False. He supports liberty while retaining social constraints.',
    };

    const prompt = buildScoreAnswerPrompt(
      SAMPLE_PASSAGE,
      trueFalseQuestion,
      'True/False selection: False\nExplanation (<= 2 sentences): He keeps social limits.'
    );

    expect(prompt).toContain('True-false grading requirements:');
    expect(prompt).toContain('If the selected truth value is wrong, score must be 0.');
  });

  it('parses generated check response from direct JSON payload', () => {
    const parsed = parseGeneratedCheckResponse(`
{
  "questions": [
    {
      "dimension": "factual",
      "format": "multiple-choice",
      "prompt": "What does the passage describe?",
      "options": ["A", "B", "C", "D"],
      "correctOptionIndex": 1,
      "modelAnswer": "Choice B is the best summary."
    },
    {
      "id": "q2",
      "dimension": "evaluative",
      "format": "essay",
      "prompt": "Is the argument convincing?",
      "modelAnswer": "It is convincing because..."
    }
  ]
}
`);

    expect(parsed.questions).toHaveLength(2);
    expect(parsed.questions[0].id).toBe('q-1');
    expect(parsed.questions[0].format).toBe('multiple-choice');
    expect(parsed.questions[1].id).toBe('q2');
    expect(parsed.questions[1].format).toBe('essay');
  });

  it('falls back to fenced JSON parsing for legacy payloads', () => {
    const parsed = parseGeneratedCheckResponse(`
\`\`\`json
{
  "questions": [
    {
      "dimension": "factual",
      "format": "multiple-choice",
      "prompt": "What does the passage describe?",
      "options": ["A", "B", "C", "D"],
      "correctOptionIndex": 1,
      "modelAnswer": "Choice B is the best summary."
    },
    {
      "id": "q2",
      "dimension": "evaluative",
      "format": "essay",
      "prompt": "Is the argument convincing?",
      "modelAnswer": "It is convincing because..."
    }
  ]
}
\`\`\`
`);

    expect(parsed.questions).toHaveLength(2);
    expect(parsed.questions[0].id).toBe('q-1');
    expect(parsed.questions[0].format).toBe('multiple-choice');
    expect(parsed.questions[1].id).toBe('q2');
    expect(parsed.questions[1].format).toBe('essay');
  });

  it('rejects generation payloads that contain no valid questions', () => {
    expect(() =>
      parseGeneratedCheckResponse(JSON.stringify({
        questions: [
          {
            id: 'bad',
            dimension: 'factual',
            format: 'multiple-choice',
            prompt: 'Bad question',
            modelAnswer: 'Bad answer',
          },
        ],
      }))
    ).toThrow('Generated check contained no valid questions');
  });

  it('parses direct score response and clamps score into 0-3', () => {
    const parsed = parseQuestionScoreResponse('{ "score": 5, "feedback": "Strong answer with enough evidence." }');
    expect(parsed).toEqual({
      score: 3,
      feedback: 'Strong answer with enough evidence.',
    });
  });

  it('falls back to fenced score response parsing for legacy payloads', () => {
    const parsed = parseQuestionScoreResponse(`
\`\`\`json
{ "score": 2, "feedback": "Reasonable answer with one omission." }
\`\`\`
`);
    expect(parsed).toEqual({
      score: 2,
      feedback: 'Reasonable answer with one omission.',
    });
  });

  it('throws when score response misses feedback', () => {
    expect(() => parseQuestionScoreResponse('{ "score": 2 }')).toThrow('Score response missing feedback');
  });
});
