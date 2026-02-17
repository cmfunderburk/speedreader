import type {
  ComprehensionQuestionScore,
  ComprehensionGeminiModel,
  GeneratedComprehensionCheck,
  GeneratedComprehensionQuestion,
  ComprehensionExamPreset,
  Article,
} from '../types';
import {
  buildGenerateCheckPrompt,
  buildScoreAnswerPrompt,
  parseGeneratedCheckResponse,
  parseQuestionScoreResponse,
} from './comprehensionPrompts';
import {
  buildGenerateExamPrompt,
  parseGeneratedExamResponse,
} from './comprehensionExamPrompts';
import {
  buildComprehensionExamContext,
  getComprehensionExamSourceIds,
} from './comprehensionExamContext';
import type { GenerateExamPromptArgs, ParseGeneratedExamArgs } from './comprehensionExamPrompts';
import {
  GENERATED_CHECK_RESPONSE_JSON_SCHEMA,
  GENERATED_EXAM_RESPONSE_JSON_SCHEMA,
  QUESTION_SCORE_RESPONSE_JSON_SCHEMA,
  type GeminiJsonSchema,
} from './comprehensionSchemas';

export interface ComprehensionExamRequest {
  selectedArticles: Article[];
  preset: ComprehensionExamPreset;
  difficultyTarget: 'standard' | 'challenging';
  openBookSynthesis: boolean;
  onProgress?: (message: string) => void;
}

export interface ComprehensionAdapter {
  generateCheck(passage: string, questionCount: number): Promise<GeneratedComprehensionCheck>;
  generateExam(request: ComprehensionExamRequest): Promise<GeneratedComprehensionCheck>;
  scoreAnswer(
    passage: string,
    question: GeneratedComprehensionQuestion,
    userAnswer: string
  ): Promise<ComprehensionQuestionScore>;
}

interface GeminiCandidatePart {
  text?: string;
}

interface GeminiCandidate {
  content?: {
    parts?: GeminiCandidatePart[];
  };
}

interface GeminiResponsePayload {
  candidates?: GeminiCandidate[];
  promptFeedback?: {
    blockReason?: string;
  };
}

interface GeminiAdapterOptions {
  apiKey?: string;
  model?: ComprehensionGeminiModel;
  fetchImpl?: typeof fetch;
  apiBaseUrl?: string;
}

const DEFAULT_GEMINI_MODEL: ComprehensionGeminiModel = 'gemini-3-flash-preview';
const DEFAULT_GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const MAX_EXAM_GENERATION_ATTEMPTS = 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractGeminiText(payload: unknown): string {
  if (!isRecord(payload)) {
    throw new Error('Gemini response payload was not an object');
  }

  const typed = payload as GeminiResponsePayload;
  if (typed.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked the request (${typed.promptFeedback.blockReason})`);
  }

  const candidates = typed.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('Gemini response did not include candidates');
  }

  const parts = candidates[0]?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new Error('Gemini response did not include content parts');
  }

  const text = parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('\n')
    .trim();
  if (!text) {
    throw new Error('Gemini response did not include text content');
  }

  return text;
}

export class GeminiComprehensionAdapter implements ComprehensionAdapter {
  private readonly apiKey: string | undefined;
  private readonly model: ComprehensionGeminiModel;
  private readonly fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  private readonly apiBaseUrl: string;

  constructor(options: GeminiAdapterOptions) {
    this.apiKey = options.apiKey?.trim();
    this.model = options.model ?? DEFAULT_GEMINI_MODEL;
    const selectedFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    // Wrap to avoid calling a Window-bound fetch with adapter instance as `this`.
    this.fetchImpl = (input, init) => selectedFetch(input, init);
    this.apiBaseUrl = options.apiBaseUrl ?? DEFAULT_GEMINI_API_BASE_URL;
  }

  async generateCheck(passage: string, questionCount: number): Promise<GeneratedComprehensionCheck> {
    const prompt = buildGenerateCheckPrompt(passage, questionCount);
    const rawText = await this.generateContent(prompt, GENERATED_CHECK_RESPONSE_JSON_SCHEMA);
    return parseGeneratedCheckResponse(rawText);
  }

  async generateExam(request: ComprehensionExamRequest): Promise<GeneratedComprehensionCheck> {
    request.onProgress?.('Preparing exam context...');
    const context = buildComprehensionExamContext(request.selectedArticles, request.preset);
    const sourceArticleIds = getComprehensionExamSourceIds(context);
    const generatorInput: GenerateExamPromptArgs = {
      sourceContext: renderSourceContext(context),
      preset: request.preset,
      difficultyTarget: request.difficultyTarget,
    };
    const basePrompt = buildGenerateExamPrompt(generatorInput);

    let lastError: unknown = null;

    for (let attempt = 0; attempt < MAX_EXAM_GENERATION_ATTEMPTS; attempt += 1) {
      const attemptNumber = attempt + 1;
      try {
        request.onProgress?.(`Generating exam draft (${attemptNumber}/${MAX_EXAM_GENERATION_ATTEMPTS})...`);
        const prompt = attempt === 0
          ? basePrompt
          : buildExamRetryPrompt(basePrompt, lastError);
        const rawText = await this.generateContent(prompt, GENERATED_EXAM_RESPONSE_JSON_SCHEMA);
        request.onProgress?.(`Validating exam draft (${attemptNumber}/${MAX_EXAM_GENERATION_ATTEMPTS})...`);
        const parseArgs: ParseGeneratedExamArgs = {
          raw: rawText,
          preset: request.preset,
          difficultyTarget: request.difficultyTarget,
          selectedSourceArticleIds: sourceArticleIds,
        };
        return parseGeneratedExamResponse(parseArgs);
      } catch (error) {
        lastError = error;
        if (shouldRetryExamGenerationError(error) && attempt < MAX_EXAM_GENERATION_ATTEMPTS - 1) {
          request.onProgress?.(`Exam format validation failed, retrying (${attemptNumber + 1}/${MAX_EXAM_GENERATION_ATTEMPTS})...`);
          continue;
        }
        throw lastError;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Failed to generate a valid exam');
  }

  async scoreAnswer(
    passage: string,
    question: GeneratedComprehensionQuestion,
    userAnswer: string
  ): Promise<ComprehensionQuestionScore> {
    const prompt = buildScoreAnswerPrompt(passage, question, userAnswer);
    const rawText = await this.generateContent(prompt, QUESTION_SCORE_RESPONSE_JSON_SCHEMA);
    return parseQuestionScoreResponse(rawText);
  }

  private async generateContent(prompt: string, responseJsonSchema?: GeminiJsonSchema): Promise<string> {
    if (!this.apiKey) {
      throw new Error('Comprehension check requires an API key');
    }

    const response = await this.fetchImpl(
      `${this.apiBaseUrl}/models/${encodeURIComponent(this.model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            ...(responseJsonSchema ? { responseJsonSchema } : {}),
            temperature: 0.2,
          },
        }),
      }
    );

    if (!response.ok) {
      const message = (await response.text()).trim();
      throw new Error(
        `Gemini request failed (${response.status}): ${message || response.statusText || 'unknown error'}`
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error('Gemini response was not valid JSON');
    }

    return extractGeminiText(payload);
  }

}

interface CreateComprehensionAdapterOptions extends GeminiAdapterOptions {
  provider?: 'gemini';
}

export function createComprehensionAdapter(
  options: CreateComprehensionAdapterOptions
): ComprehensionAdapter {
  return new GeminiComprehensionAdapter(options);
}

function renderSourceContext(context: ReturnType<typeof buildComprehensionExamContext>): string {
  return context.packets
    .map((packet, index) => {
      const header = `${index + 1}. ${packet.title}`;
      const sourceMeta = packet.group ? ` (${packet.group})` : '';
      return `${header}${sourceMeta}\n[sourceId=${packet.articleId}]\n${packet.excerpt}`;
    })
    .join('\n\n');
}

function shouldRetryExamGenerationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (!message) return true;
  if (message.includes('requires an API key')) return false;
  if (message.includes('Gemini blocked the request')) return false;
  if (message.includes('Gemini request failed (401)')) return false;
  if (message.includes('Gemini request failed (403)')) return false;
  return true;
}

function buildExamRetryPrompt(basePrompt: string, lastError: unknown): string {
  const rawMessage = lastError instanceof Error ? lastError.message : String(lastError ?? '');
  const compactMessage = rawMessage.replace(/\s+/g, ' ').trim().slice(0, 220);
  return [
    basePrompt,
    '',
    'IMPORTANT: The previous output failed validation.',
    compactMessage ? `Validation error: ${compactMessage}` : 'Validation error: unknown',
    'Return JSON only. Do not include markdown fences or explanatory text.',
  ].join('\n');
}
