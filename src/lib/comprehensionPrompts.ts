import type {
  ComprehensionDimension,
  ComprehensionFormat,
  ComprehensionKeyPoint,
  ComprehensionKeyPointResult,
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

function extractFallbackJsonSnippet(rawResponse: string): string {
  const trimmed = rawResponse.trim();
  if (!trimmed) {
    throw new Error('LLM response was empty');
  }

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

function deriveFallbackKeyPoints(modelAnswer: string): ComprehensionKeyPoint[] {
  const matches = modelAnswer.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  const keyPoints = matches
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
    .slice(0, 3)
    .map((sentence, index) => ({
      id: `kp-${index + 1}`,
      text: sentence,
      weight: 1,
    }));

  if (keyPoints.length > 0) {
    return keyPoints;
  }

  return [{ id: 'kp-1', text: modelAnswer, weight: 1 }];
}

function parseKeyPoint(value: unknown): ComprehensionKeyPoint | null {
  if (isNonEmptyString(value)) {
    return { text: value.trim() };
  }
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const obj = value as Record<string, unknown>;
  const text = isNonEmptyString(obj.text) ? obj.text.trim() : null;
  if (!text) return null;

  const keyPoint: ComprehensionKeyPoint = { text };
  if (isNonEmptyString(obj.id)) {
    keyPoint.id = obj.id.trim();
  }
  if (typeof obj.weight === 'number' && Number.isFinite(obj.weight) && obj.weight >= 0) {
    keyPoint.weight = obj.weight;
  }

  return keyPoint;
}

function parseKeyPoints(value: unknown, modelAnswer: string): ComprehensionKeyPoint[] {
  if (!Array.isArray(value)) {
    return deriveFallbackKeyPoints(modelAnswer);
  }

  const keyPoints = value
    .map(parseKeyPoint)
    .filter((keyPoint): keyPoint is ComprehensionKeyPoint => keyPoint !== null);
  if (keyPoints.length > 0) {
    return keyPoints;
  }

  return deriveFallbackKeyPoints(modelAnswer);
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
    keyPoints: parseKeyPoints(obj.keyPoints ?? obj.key_points, modelAnswer),
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
  const trimmed = rawResponse.trim();
  if (!trimmed) {
    throw new Error('LLM response was empty');
  }

  let parsed: unknown;
  try {
    // Schema-driven calls should return direct JSON; parse this path first.
    parsed = JSON.parse(trimmed);
  } catch {
    const fallbackText = extractFallbackJsonSnippet(rawResponse);
    try {
      parsed = JSON.parse(fallbackText);
    } catch {
      throw new Error('LLM response JSON was invalid');
    }
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
    '- Every question must include keyPoints as a concise checklist (2-4 items) with optional weights.',
    '- Every question must include an explanatory modelAnswer.',
    '- Output formatting is enforced by a response schema supplied by the caller.',
    '- Do not include markdown fences or explanatory commentary.',
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
  const keyPoints = (question.keyPoints && question.keyPoints.length > 0)
    ? question.keyPoints
    : deriveFallbackKeyPoints(question.modelAnswer);

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
    'Score key points first, then assign the 0-3 score.',
    'Output formatting is enforced by a response schema supplied by the caller.',
    'Do not include markdown fences or explanatory commentary.',
    '',
    'Scoring rubric (0-3):',
    '- 0: Incorrect or unsupported by passage evidence.',
    '- 1: Minimal understanding; major omissions or errors.',
    '- 2: Mostly correct with some gaps or imprecision.',
    '- 3: Accurate, well-supported, and complete for the prompt.',
    '',
    'Key-point scoring requirements:',
    '- Evaluate every key point and return keyPointResults[] with keyPoint + hit (+ optional evidence/weight).',
    '- Use key points as the primary grading signal (not writing style).',
    '- Weighted coverage guidance: <25% => 0, 25-49% => 1, 50-79% => 2, >=80% => 3 (adjust if major contradiction).',
    ...trueFalseRubric,
    '',
    'Question:',
    JSON.stringify(question, null, 2),
    '',
    'Key points checklist:',
    JSON.stringify(keyPoints, null, 2),
    '',
    `User answer:\n${userAnswer}`,
    '',
    'Passage:',
    passage,
  ].join('\n');
}

function parseKeyPointResult(value: unknown): ComprehensionKeyPointResult | null {
  if (typeof value !== 'object' || value === null) return null;
  const obj = value as Record<string, unknown>;
  const keyPoint = isNonEmptyString(obj.keyPoint) ? obj.keyPoint.trim() : null;
  if (!keyPoint || typeof obj.hit !== 'boolean') return null;

  const result: ComprehensionKeyPointResult = {
    keyPoint,
    hit: obj.hit,
  };
  if (isNonEmptyString(obj.evidence)) {
    result.evidence = obj.evidence.trim();
  }
  if (typeof obj.weight === 'number' && Number.isFinite(obj.weight) && obj.weight >= 0) {
    result.weight = obj.weight;
  }

  return result;
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

  const response: ComprehensionQuestionScore = {
    score: Math.max(0, Math.min(3, scoreRaw)),
    feedback,
  };
  if (Array.isArray(parsed.keyPointResults)) {
    const keyPointResults = parsed.keyPointResults
      .map(parseKeyPointResult)
      .filter((item): item is ComprehensionKeyPointResult => item !== null);
    if (keyPointResults.length > 0 || parsed.keyPointResults.length === 0) {
      response.keyPointResults = keyPointResults;
    }
  }

  return {
    ...response,
  };
}
