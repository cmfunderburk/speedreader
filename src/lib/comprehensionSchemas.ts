export type GeminiJsonSchema = Record<string, unknown>;

const KEY_POINT_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    text: { type: 'string' },
    weight: { type: 'number' },
  },
  required: ['text'],
} as const;

export const GENERATED_CHECK_RESPONSE_JSON_SCHEMA: GeminiJsonSchema = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          dimension: { type: 'string' },
          format: { type: 'string' },
          prompt: { type: 'string' },
          options: {
            type: 'array',
            items: { type: 'string' },
          },
          correctOptionIndex: { type: 'integer' },
          correctAnswer: { type: 'boolean' },
          modelAnswer: { type: 'string' },
          keyPoints: {
            type: 'array',
            items: KEY_POINT_SCHEMA,
          },
        },
        required: ['dimension', 'format', 'prompt', 'modelAnswer'],
      },
    },
  },
  required: ['questions'],
};

export const GENERATED_EXAM_RESPONSE_JSON_SCHEMA: GeminiJsonSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          dimension: { type: 'string' },
          format: { type: 'string' },
          section: { type: 'string' },
          sourceArticleId: { type: 'string' },
          prompt: { type: 'string' },
          options: {
            type: 'array',
            items: { type: 'string' },
          },
          correctOptionIndex: { type: 'integer' },
          correctAnswer: { type: 'boolean' },
          modelAnswer: { type: 'string' },
          keyPoints: {
            type: 'array',
            items: KEY_POINT_SCHEMA,
          },
        },
        required: [
          'dimension',
          'format',
          'section',
          'sourceArticleId',
          'prompt',
          'modelAnswer',
        ],
      },
    },
  },
  required: ['items'],
};

export const QUESTION_SCORE_RESPONSE_JSON_SCHEMA: GeminiJsonSchema = {
  type: 'object',
  properties: {
    score: { type: 'number' },
    feedback: { type: 'string' },
    keyPointResults: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          keyPoint: { type: 'string' },
          hit: { type: 'boolean' },
          evidence: { type: 'string' },
          weight: { type: 'number' },
        },
        required: ['keyPoint', 'hit'],
      },
    },
  },
  required: ['score', 'feedback'],
};
