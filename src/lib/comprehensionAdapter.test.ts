import { describe, expect, it, vi } from 'vitest';
import { GeminiComprehensionAdapter, createComprehensionAdapter } from './comprehensionAdapter';
import type { GeneratedComprehensionQuestion } from '../types';

function makeJsonResponse(body: unknown, status: number = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function makeQuestion(): GeneratedComprehensionQuestion {
  return {
    id: 'q1',
    dimension: 'inference',
    format: 'short-answer',
    prompt: 'What does this imply?',
    modelAnswer: 'It implies a balance between principles.',
  };
}

describe('comprehensionAdapter', () => {
  it('generates a check through Gemini and parses the JSON payload', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => makeJsonResponse({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  questions: [
                    {
                      id: 'q1',
                      dimension: 'factual',
                      format: 'true-false',
                      prompt: 'The passage states Mill valued liberty.',
                      correctAnswer: true,
                      modelAnswer: 'Yes, the passage says that explicitly.',
                    },
                  ],
                }),
              },
            ],
          },
        },
      ],
    }));

    const adapter = new GeminiComprehensionAdapter({
      apiKey: 'test-key',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await adapter.generateCheck('Sample passage text', 8);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].format).toBe('true-false');
    expect(result.questions[0].correctAnswer).toBe(true);

    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    expect(String(firstCall?.[0])).toContain('/models/gemini-3-flash-preview:generateContent?key=test-key');
    const requestInit = firstCall?.[1];
    expect(requestInit).toBeDefined();
    const requestBody = JSON.parse(String(requestInit?.body));
    expect(requestBody.contents[0].parts[0].text).toContain('Sample passage text');
  });

  it('uses configured Gemini model when provided', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => makeJsonResponse({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  questions: [
                    {
                      id: 'q1',
                      dimension: 'factual',
                      format: 'true-false',
                      prompt: 'Prompt',
                      correctAnswer: true,
                      modelAnswer: 'Answer',
                    },
                  ],
                }),
              },
            ],
          },
        },
      ],
    }));
    const adapter = new GeminiComprehensionAdapter({
      apiKey: 'test-key',
      model: 'gemini-3-pro-preview',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await adapter.generateCheck('Passage', 8);

    const firstCall = fetchMock.mock.calls[0];
    expect(String(firstCall?.[0])).toContain('/models/gemini-3-pro-preview:generateContent?key=test-key');
  });

  it('calls global fetch with global context when fetchImpl is not provided', async () => {
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.fn(function (this: unknown): Promise<Response> {
      if (this !== globalThis) {
        throw new Error('Fetch called with invalid context');
      }
      return Promise.resolve(makeJsonResponse({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    questions: [
                      {
                        id: 'q1',
                        dimension: 'factual',
                        format: 'true-false',
                        prompt: 'Prompt',
                        correctAnswer: true,
                        modelAnswer: 'Answer',
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }));
    }) as unknown as typeof fetch;
    (globalThis as { fetch: typeof fetch }).fetch = fetchSpy;

    try {
      const adapter = new GeminiComprehensionAdapter({
        apiKey: 'test-key',
      });
      const result = await adapter.generateCheck('Passage', 8);
      expect(result.questions).toHaveLength(1);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
    }
  });

  it('scores an answer through Gemini and parses fenced JSON', async () => {
    const fetchMock = vi.fn(async () => makeJsonResponse({
      candidates: [
        {
          content: {
            parts: [
              {
                text: '```json\n{ "score": 2, "feedback": "Reasonable answer with one gap." }\n```',
              },
            ],
          },
        },
      ],
    }));

    const adapter = createComprehensionAdapter({
      apiKey: 'test-key',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const score = await adapter.scoreAnswer('Passage', makeQuestion(), 'My answer');
    expect(score).toEqual({
      score: 2,
      feedback: 'Reasonable answer with one gap.',
    });
  });

  it('fails clearly when API key is missing', async () => {
    const adapter = new GeminiComprehensionAdapter({});
    await expect(adapter.generateCheck('Passage', 8)).rejects.toThrow('requires an API key');
  });

  it('surfaces HTTP failures with status context', async () => {
    const fetchMock = vi.fn(async () => makeJsonResponse({ error: 'invalid key' }, 401));
    const adapter = new GeminiComprehensionAdapter({
      apiKey: 'bad-key',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(adapter.generateCheck('Passage', 8)).rejects.toThrow('Gemini request failed (401)');
  });

  it('throws for malformed Gemini payloads without candidates', async () => {
    const fetchMock = vi.fn(async () => makeJsonResponse({}));
    const adapter = new GeminiComprehensionAdapter({
      apiKey: 'test-key',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(adapter.generateCheck('Passage', 8)).rejects.toThrow('did not include candidates');
  });
});
