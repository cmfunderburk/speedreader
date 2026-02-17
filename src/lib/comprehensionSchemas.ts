export type GeminiJsonSchema = Record<string, unknown>;

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
  },
  required: ['score', 'feedback'],
};
