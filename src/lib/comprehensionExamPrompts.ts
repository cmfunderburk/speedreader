import type {
  ComprehensionExamPreset,
  ComprehensionDimension,
  ComprehensionExamSection,
  ComprehensionFormat,
  GeneratedComprehensionCheck,
  GeneratedComprehensionQuestion,
} from '../types';

type ExamDifficulty = 'standard' | 'challenging';

export interface ComprehensionExamBlueprint {
  questionCount: number;
  sectionCounts: Record<ComprehensionExamSection, number>;
  standardConstructedMin: number;
  challengingConstructedMin: number;
}

export interface GenerateExamPromptArgs {
  sourceContext: string;
  preset: ComprehensionExamPreset;
  difficultyTarget: ExamDifficulty;
}

export interface ParseGeneratedExamArgs {
  raw: string;
  preset: ComprehensionExamPreset;
  difficultyTarget: ExamDifficulty;
  selectedSourceArticleIds: string[];
}

const COMPREHENSION_DIMENSIONS: ComprehensionDimension[] = ['factual', 'inference', 'structural', 'evaluative'];
const COMPREHENSION_FORMATS: ComprehensionFormat[] = ['multiple-choice', 'true-false', 'short-answer', 'essay'];
const COMPREHENSION_SECTIONS: ComprehensionExamSection[] = ['recall', 'interpretation', 'synthesis'];

const EXAM_BLUEPRINTS: Record<ComprehensionExamPreset, ComprehensionExamBlueprint> = {
  quiz: {
    questionCount: 12,
    sectionCounts: {
      recall: 3,
      interpretation: 5,
      synthesis: 4,
    },
    standardConstructedMin: 5,
    challengingConstructedMin: 6,
  },
  midterm: {
    questionCount: 18,
    sectionCounts: {
      recall: 5,
      interpretation: 8,
      synthesis: 5,
    },
    standardConstructedMin: 7,
    challengingConstructedMin: 9,
  },
  final: {
    questionCount: 24,
    sectionCounts: {
      recall: 6,
      interpretation: 11,
      synthesis: 7,
    },
    standardConstructedMin: 9,
    challengingConstructedMin: 12,
  },
} as const;

function getBlueprint(preset: ComprehensionExamPreset): ComprehensionExamBlueprint {
  return EXAM_BLUEPRINTS[preset];
}

export function getComprehensionExamBlueprint(preset: ComprehensionExamPreset): ComprehensionExamBlueprint {
  return getBlueprint(preset);
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseDimension(value: unknown): ComprehensionDimension | null {
  return typeof value === 'string' && COMPREHENSION_DIMENSIONS.includes(value as ComprehensionDimension)
    ? value as ComprehensionDimension
    : null;
}

function parseFormat(value: unknown): ComprehensionFormat | null {
  return typeof value === 'string' && COMPREHENSION_FORMATS.includes(value as ComprehensionFormat)
    ? value as ComprehensionFormat
    : null;
}

function parseSection(value: unknown): ComprehensionExamSection | null {
  return typeof value === 'string' && COMPREHENSION_SECTIONS.includes(value as ComprehensionExamSection)
    ? value as ComprehensionExamSection
    : null;
}

function parseOptions(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const options = value.filter(isNonEmptyString).map((option) => option.trim());
  if (options.length !== 4) return null;
  const unique = new Set(options.map((option) => option.toLowerCase()));
  return unique.size === options.length ? options : null;
}

interface FlattenedExamItem {
  obj: Record<string, unknown>;
  inheritedSection?: ComprehensionExamSection;
  inheritedSourceArticleId?: string;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[_\s]+/g, '-');
}

function parseFormatFlexible(value: unknown): ComprehensionFormat | null {
  const strict = parseFormat(value);
  if (strict) return strict;
  if (typeof value !== 'string') return null;
  const token = normalizeToken(value);
  if (token === 'mcq' || token === 'multiple-choice' || token === 'multiplechoice') return 'multiple-choice';
  if (token === 'true-false' || token === 'truefalse' || token === 'boolean') return 'true-false';
  if (token === 'short-answer' || token === 'shortanswer') return 'short-answer';
  if (token === 'long-answer' || token === 'longanswer') return 'essay';
  return null;
}

function parseDimensionFlexible(value: unknown): ComprehensionDimension | null {
  const strict = parseDimension(value);
  if (strict) return strict;
  if (typeof value !== 'string') return null;
  const token = normalizeToken(value);
  if (token === 'analysis' || token === 'analytical') return 'inference';
  if (token === 'critical' || token === 'critique') return 'evaluative';
  if (token === 'structure') return 'structural';
  return null;
}

function parseSectionFlexible(value: unknown): ComprehensionExamSection | null {
  const strict = parseSection(value);
  if (strict) return strict;
  if (typeof value !== 'string') return null;
  const token = normalizeToken(value);
  if (token === 'understanding') return 'interpretation';
  if (token === 'integration') return 'synthesis';
  return null;
}

function parseBooleanFlexible(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;
  const token = normalizeToken(value);
  if (token === 'true' || token === 't' || token === 'yes') return true;
  if (token === 'false' || token === 'f' || token === 'no') return false;
  return null;
}

function parseIntegerFlexible(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
    const letter = trimmed.toUpperCase();
    if (/^[A-Z]$/.test(letter)) {
      return letter.charCodeAt(0) - 'A'.charCodeAt(0);
    }
  }
  return null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (isNonEmptyString(value)) return value.trim();
  }
  return null;
}

function inferSectionFromFormat(format: ComprehensionFormat | null): ComprehensionExamSection {
  if (format === 'multiple-choice' || format === 'true-false') return 'recall';
  return 'interpretation';
}

function inferDimensionFromSection(section: ComprehensionExamSection): ComprehensionDimension {
  if (section === 'recall') return 'factual';
  if (section === 'interpretation') return 'inference';
  return 'evaluative';
}

function deriveModelAnswerFallback(
  format: ComprehensionFormat,
  options: string[] | null,
  correctOptionIndex: number | null,
  correctAnswer: boolean | null
): string | null {
  if (format === 'multiple-choice' && options && correctOptionIndex !== null) {
    return `Correct option: ${options[correctOptionIndex]}`;
  }
  if (format === 'true-false' && correctAnswer !== null) {
    return `Correct answer: ${correctAnswer ? 'True' : 'False'}.`;
  }
  return null;
}

function extractTopLevelItems(parsed: Record<string, unknown>): unknown[] {
  if (Array.isArray(parsed.items)) return parsed.items;
  if (Array.isArray(parsed.questions)) return parsed.questions;
  if (Array.isArray(parsed.examItems)) return parsed.examItems;

  const sections = parsed.sections;
  if (typeof sections === 'object' && sections !== null && !Array.isArray(sections)) {
    const sectionObj = sections as Record<string, unknown>;
    const merged: unknown[] = [];
    for (const section of COMPREHENSION_SECTIONS) {
      const value = sectionObj[section];
      if (Array.isArray(value)) {
        merged.push({
          section,
          items: value,
        });
      }
    }
    if (merged.length > 0) return merged;
  }

  throw new Error('Generated exam JSON missing items array');
}

function isLikelyQuestionObject(obj: Record<string, unknown>): boolean {
  return (
    pickString(obj, ['prompt', 'question', 'stem', 'text']) !== null
    || obj.format !== undefined
    || obj.type !== undefined
    || Array.isArray(obj.options)
    || Array.isArray(obj.choices)
  );
}

function flattenExamItems(
  rawItems: unknown[],
  inheritedSection?: ComprehensionExamSection,
  inheritedSourceArticleId?: string,
  depth: number = 0
): FlattenedExamItem[] {
  if (depth > 3) {
    throw new Error('Exam item nesting exceeded supported depth');
  }

  const flattened: FlattenedExamItem[] = [];
  for (const value of rawItems) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      continue;
    }
    const obj = value as Record<string, unknown>;
    const nextSection = parseSectionFlexible(obj.section) ?? inheritedSection;
    const nextSource = pickString(obj, ['sourceArticleId', 'sourceId', 'source', 'source_article_id']) ?? inheritedSourceArticleId;

    const nested = Array.isArray(obj.items)
      ? obj.items
      : Array.isArray(obj.questions)
        ? obj.questions
        : null;

    if (nested && !isLikelyQuestionObject(obj)) {
      flattened.push(...flattenExamItems(nested, nextSection, nextSource, depth + 1));
      continue;
    }

    flattened.push({
      obj,
      inheritedSection: nextSection,
      inheritedSourceArticleId: nextSource,
    });
  }

  return flattened;
}

function chooseSourceId(
  rawSourceId: string | null,
  allowedSourceIds: string[],
  index: number
): string | null {
  if (rawSourceId && allowedSourceIds.includes(rawSourceId)) {
    return rawSourceId;
  }
  if (allowedSourceIds.length === 1) {
    return allowedSourceIds[0];
  }
  if (rawSourceId) {
    const ordinalMatch = rawSourceId.match(/(\d+)/);
    if (ordinalMatch) {
      const ordinal = Number(ordinalMatch[1]) - 1;
      if (ordinal >= 0 && ordinal < allowedSourceIds.length) {
        return allowedSourceIds[ordinal];
      }
    }
  }
  if (allowedSourceIds.length > 1) {
    return allowedSourceIds[index % allowedSourceIds.length];
  }
  return null;
}

function parseGeneratedExamQuestion(
  item: FlattenedExamItem,
  index: number,
  allowedSourceIds: string[]
): GeneratedComprehensionQuestion {
  const { obj, inheritedSection, inheritedSourceArticleId } = item;

  const options = parseOptions(obj.options) ?? parseOptions(obj.choices);
  const correctOptionIndex = parseIntegerFlexible(
    obj.correctOptionIndex ?? obj.correctIndex ?? obj.answerIndex ?? obj.answerOption
  );
  const correctAnswer = parseBooleanFlexible(
    obj.correctAnswer ?? obj.answer ?? obj.isTrue
  );

  const format = parseFormatFlexible(obj.format ?? obj.type)
    ?? (options ? 'multiple-choice' : null)
    ?? (correctAnswer !== null ? 'true-false' : null)
    ?? 'short-answer';
  const section = parseSectionFlexible(obj.section ?? obj.phase)
    ?? inheritedSection
    ?? inferSectionFromFormat(format);
  const dimension = parseDimensionFlexible(obj.dimension ?? obj.skill ?? obj.competency)
    ?? inferDimensionFromSection(section);

  const sourceRaw = pickString(obj, ['sourceArticleId', 'sourceId', 'source', 'source_article_id']) ?? inheritedSourceArticleId ?? null;
  const sourceArticleId = chooseSourceId(sourceRaw, allowedSourceIds, index);
  const prompt = pickString(obj, ['prompt', 'question', 'stem', 'text']);
  const modelAnswer = pickString(obj, ['modelAnswer', 'answer', 'explanation', 'rationale'])
    ?? deriveModelAnswerFallback(format, options, correctOptionIndex, correctAnswer);

  if (!sourceArticleId || !prompt || !modelAnswer) {
    throw new Error(`Exam item ${index} is missing required fields`);
  }

  const id = pickString(obj, ['id', 'questionId']) ?? `exam-${index + 1}`;
  const question: GeneratedComprehensionQuestion = {
    id,
    dimension,
    format,
    section,
    sourceArticleId,
    prompt,
    modelAnswer,
  };

  if (format === 'multiple-choice') {
    if (!options || correctOptionIndex === null || correctOptionIndex < 0 || correctOptionIndex >= options.length) {
      throw new Error(`Exam item ${index} has invalid multiple-choice payload`);
    }
    question.options = options;
    question.correctOptionIndex = correctOptionIndex;
  }

  if (format === 'true-false') {
    if (correctAnswer === null) {
      throw new Error(`Exam item ${index} has invalid true-false payload`);
    }
    question.correctAnswer = correctAnswer;
  }

  return question;
}

function assertItemInvariants(items: GeneratedComprehensionQuestion[], preset: ComprehensionExamPreset): void {
  const blueprint = getBlueprint(preset);
  const sectionCounts = {
    recall: 0,
    interpretation: 0,
    synthesis: 0,
  };

  if (items.length !== blueprint.questionCount) {
    throw new Error(`Exam item count mismatch: expected ${blueprint.questionCount}, got ${items.length}`);
  }

  const idSet = new Set<string>();
  let constructedCount = 0;

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!item.id || idSet.has(item.id)) {
      throw new Error(`Exam item ${i} has missing or duplicate id`);
    }
    idSet.add(item.id);

    const section = item.section;
    if (section === undefined) {
      throw new Error(`Exam item ${i} has no section`);
    }
    sectionCounts[section] += 1;

    if (item.section === 'recall' && item.format !== 'multiple-choice' && item.format !== 'true-false') {
      throw new Error(`Recall item ${i} must be objective-only`);
    }

    if (item.format === 'short-answer' || item.format === 'essay') {
      constructedCount += 1;
    }
  }

  for (const section of COMPREHENSION_SECTIONS) {
    if (sectionCounts[section] !== blueprint.sectionCounts[section]) {
      throw new Error(`Exam section ${section} mismatch: expected ${blueprint.sectionCounts[section]}, got ${sectionCounts[section]}`);
    }
  }

  if (constructedCount < blueprint.standardConstructedMin) {
    throw new Error(`Exam item has insufficient constructed-response questions (${constructedCount})`);
  }

  return;
}

function validateDifficultyTargets(
  items: GeneratedComprehensionQuestion[],
  preset: ComprehensionExamPreset,
  difficultyTarget: ExamDifficulty
): void {
  const blueprint = getBlueprint(preset);
  let constructedCount = 0;
  let essayCount = 0;

  for (const item of items) {
    if (item.format === 'short-answer' || item.format === 'essay') {
      constructedCount += 1;
    }
    if (item.format === 'essay') essayCount += 1;
  }

  const minimumConstructed = difficultyTarget === 'standard'
    ? blueprint.standardConstructedMin
    : blueprint.challengingConstructedMin;

  if (constructedCount < minimumConstructed) {
    throw new Error(`Exam difficulty target ${difficultyTarget} requires at least ${minimumConstructed} constructed-response questions`);
  }

  if (difficultyTarget === 'challenging' && essayCount < 1) {
    throw new Error('Challenging difficulty requires at least one essay question');
  }
}

function validateSourceCoverage(items: GeneratedComprehensionQuestion[], selectedSourceIds: string[]): void {
  if (selectedSourceIds.length >= 2) {
    const distinctSources = new Set(items.map((item) => item.sourceArticleId));
    if (distinctSources.size < 2) {
      throw new Error('Exam must reference at least two distinct source articles');
    }
  }
}

export function buildGenerateExamPrompt(args: GenerateExamPromptArgs): string {
  const blueprint = getBlueprint(args.preset);
  const sectionMix = Object.entries(blueprint.sectionCounts)
    .map(([section, count]) => `- ${section}: ${count}`)
    .join('\n');

  return [
    'You are generating a multi-source comprehension exam.',
    `Preset: ${args.preset}`,
    `Total questions: ${blueprint.questionCount}`,
    `Difficulty target: ${args.difficultyTarget}`,
    `Section mix (exact):`,
    sectionMix,
    '',
    'Requirements:',
    '- Section must be one of: recall, interpretation, synthesis.',
    '- Every question must include sourceArticleId.',
    '- sourceArticleId must reference one of the provided sources.',
    '- Recall questions must be objective format only: multiple-choice or true-false.',
    '- Multiple-choice must include exactly 4 unique options and a valid correctOptionIndex.',
    '- True-false must include valid correctAnswer boolean.',
    '- True-false prompts must ask for True/False plus a brief explanation in <= 2 sentences.',
    '- Short-answer and essay must include modelAnswer.',
    '- Include sections in order: recall, interpretation, synthesis.',
    '- Output formatting is enforced by a response schema supplied by the caller.',
    '- Do not include markdown fences or explanatory commentary.',
    '',
    'Sources:',
    args.sourceContext,
  ].join('\n');
}

export function parseGeneratedExamResponse(args: ParseGeneratedExamArgs): GeneratedComprehensionCheck {
  const parsed = parseRawJsonObject(args.raw);
  const rawItems = extractTopLevelItems(parsed);
  const flattened = flattenExamItems(rawItems);

  const questions = flattened.map((item, index) =>
    parseGeneratedExamQuestion(item, index, args.selectedSourceArticleIds)
  );

  assertItemInvariants(questions, args.preset);
  validateDifficultyTargets(questions, args.preset, args.difficultyTarget);
  validateSourceCoverage(questions, args.selectedSourceArticleIds);

  return { questions };
}
