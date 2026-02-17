import type {
  ComprehensionDimension,
  ComprehensionFormat,
  ComprehensionQuestionScore,
  GeneratedComprehensionCheck,
  GeneratedComprehensionQuestion,
} from '../types';

const DIMENSIONS: ComprehensionDimension[] = ['factual', 'inference', 'structural', 'evaluative'];
const FORMATS: ComprehensionFormat[] = ['multiple-choice', 'true-false', 'short-answer', 'essay'];
const DEFAULT_QUESTION_COUNT = 8;
const MIN_QUESTION_COUNT = 8;
const MAX_QUESTION_COUNT = 10;

function clampQuestionCount(questionCount: number): number {
  if (!Number.isFinite(questionCount)) return DEFAULT_QUESTION_COUNT;
  return Math.max(MIN_QUESTION_COUNT, Math.min(MAX_QUESTION_COUNT, Math.round(questionCount)));
}

function extractJsonSnippet(rawResponse: string): string {
  const trimmed = rawResponse.trim();
  if (!trimmed) {
    throw new Error('LLM response was empty');
  }

  if (trimmed.startsWith('{')) return trimmed;

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  throw new Error('LLM response did not contain JSON');
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseDimension(value: unknown): ComprehensionDimension | null {
  return typeof value === 'string' && DIMENSIONS.includes(value as ComprehensionDimension)
    ? value as ComprehensionDimension
    : null;
}

function parseFormat(value: unknown): ComprehensionFormat | null {
  return typeof value === 'string' && FORMATS.includes(value as ComprehensionFormat)
    ? value as ComprehensionFormat
    : null;
}

function parseOptions(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const options = value.filter(isNonEmptyString).map((opt) => opt.trim());
  return options.length >= 2 ? options : null;
}

function parseGeneratedQuestion(value: unknown, index: number): GeneratedComprehensionQuestion | null {
  if (typeof value !== 'object' || value === null) return null;
  const obj = value as Record<string, unknown>;

  const dimension = parseDimension(obj.dimension);
  const format = parseFormat(obj.format);
  const prompt = isNonEmptyString(obj.prompt) ? obj.prompt.trim() : null;
  const modelAnswer = isNonEmptyString(obj.modelAnswer) ? obj.modelAnswer.trim() : null;
  if (!dimension || !format || !prompt || !modelAnswer) return null;

  const id = isNonEmptyString(obj.id) ? obj.id.trim() : `q-${index + 1}`;
  const question: GeneratedComprehensionQuestion = {
    id,
    dimension,
    format,
    prompt,
    modelAnswer,
  };

  if (format === 'multiple-choice') {
    const options = parseOptions(obj.options);
    const correctOptionIndex = typeof obj.correctOptionIndex === 'number'
      ? Math.trunc(obj.correctOptionIndex)
      : Number.NaN;
    if (!options || !Number.isInteger(correctOptionIndex) || correctOptionIndex < 0 || correctOptionIndex >= options.length) {
      return null;
    }
    question.options = options;
    question.correctOptionIndex = correctOptionIndex;
  }

  if (format === 'true-false') {
    if (typeof obj.correctAnswer !== 'boolean') return null;
    question.correctAnswer = obj.correctAnswer;
  }

  return question;
}

function parseRawJsonObject(rawResponse: string): Record<string, unknown> {
  const jsonText = extractJsonSnippet(rawResponse);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('LLM response JSON was invalid');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('LLM response JSON must be an object');
  }

  return parsed as Record<string, unknown>;
}

export function buildGenerateCheckPrompt(passage: string, questionCount: number): string {
  const clampedCount = clampQuestionCount(questionCount);
  return [
    'You are generating a passage-grounded reading comprehension check.',
    `Generate exactly ${clampedCount} questions for the passage below.`,
    '',
    'Requirements:',
    '- Use only evidence from the passage. Do not use outside knowledge.',
    '- Include a mix of dimensions: factual, inference, structural, evaluative.',
    '- Include a mix of formats: multiple-choice, true-false, short-answer, essay.',
    '- Multiple-choice questions must include 4 plausible options and a correctOptionIndex.',
    '- True-false questions must include correctAnswer as a boolean.',
    '- True-false prompts must explicitly ask for True/False plus a brief explanation in <= 2 sentences.',
    '- Every question must include an explanatory modelAnswer.',
    '',
    'Return JSON only with this exact shape:',
    '{',
    '  "questions": [',
    '    {',
    '      "id": "q1",',
    '      "dimension": "factual|inference|structural|evaluative",',
    '      "format": "multiple-choice|true-false|short-answer|essay",',
    '      "prompt": "Question text",',
    '      "options": ["A", "B", "C", "D"],',
    '      "correctOptionIndex": 0,',
    '      "correctAnswer": true,',
    '      "modelAnswer": "Concise explanatory answer"',
    '    }',
    '  ]',
    '}',
    '',
    'Passage:',
    passage,
  ].join('\n');
}

export function buildScoreAnswerPrompt(
  passage: string,
  question: GeneratedComprehensionQuestion,
  userAnswer: string
): string {
  const trueFalseRubric = question.format === 'true-false'
    ? [
      '',
      'True-false grading requirements:',
      '- Score both parts: (a) True/False selection accuracy and (b) explanation quality.',
      '- If the selected truth value is wrong, score must be 0.',
      '- Explanations longer than 2 sentences cannot receive a 3.',
      '- Explanations should be coherent, passage-grounded, and concise.',
    ]
    : [];

  return [
    'You are grading one comprehension response against a passage.',
    'Use only the passage and question context provided here.',
    'Return JSON only with this exact shape:',
    '{ "score": 0, "feedback": "Two to three concise educational sentences." }',
    '',
    'Scoring rubric (0-3):',
    '- 0: Incorrect or unsupported by passage evidence.',
    '- 1: Minimal understanding; major omissions or errors.',
    '- 2: Mostly correct with some gaps or imprecision.',
    '- 3: Accurate, well-supported, and complete for the prompt.',
    ...trueFalseRubric,
    '',
    'Question:',
    JSON.stringify(question, null, 2),
    '',
    `User answer:\n${userAnswer}`,
    '',
    'Passage:',
    passage,
  ].join('\n');
}

export function parseGeneratedCheckResponse(rawResponse: string): GeneratedComprehensionCheck {
  const parsed = parseRawJsonObject(rawResponse);
  if (!Array.isArray(parsed.questions)) {
    throw new Error('Generated check JSON missing questions array');
  }

  const questions = parsed.questions
    .map((item, index) => parseGeneratedQuestion(item, index))
    .filter((item): item is GeneratedComprehensionQuestion => item !== null);

  if (questions.length === 0) {
    throw new Error('Generated check contained no valid questions');
  }

  return { questions };
}

export function parseQuestionScoreResponse(rawResponse: string): ComprehensionQuestionScore {
  const parsed = parseRawJsonObject(rawResponse);
  const scoreRaw = typeof parsed.score === 'number' ? parsed.score : Number(parsed.score);
  if (!Number.isFinite(scoreRaw)) {
    throw new Error('Score response missing numeric score');
  }
  const feedback = isNonEmptyString(parsed.feedback) ? parsed.feedback.trim() : null;
  if (!feedback) {
    throw new Error('Score response missing feedback');
  }

  return {
    score: Math.max(0, Math.min(3, scoreRaw)),
    feedback,
  };
}
