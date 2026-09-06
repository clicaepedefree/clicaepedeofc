import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

import {
  createOpenAiCompatibleWhatsappLlmProvider,
  WhatsappAssistantLlmError,
} from './llm-provider'

const originalFetch = globalThis.fetch

describe('whatsapp assistant LLM provider', () => {
  beforeEach(() => {
    process.env.WHATSAPP_ASSISTANT_LLM_API_KEY = 'test-key'
    process.env.WHATSAPP_ASSISTANT_LLM_MODEL = 'test-model'
    process.env.WHATSAPP_ASSISTANT_LLM_URL = 'https://llm.example.com/respond'
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    delete process.env.WHATSAPP_ASSISTANT_LLM_API_KEY
    delete process.env.WHATSAPP_ASSISTANT_LLM_MODEL
    delete process.env.WHATSAPP_ASSISTANT_LLM_URL
  })

  test('calls an OpenAI-compatible Responses endpoint without exposing secrets in output', async () => {
    const fetchMock = mock(async () => {
      return new Response(
        JSON.stringify({
          output_text: 'Oi! Temos pizza disponivel hoje.',
          usage: {
            input_tokens: 100,
            output_tokens: 12,
            total_tokens: 112,
          },
          status: 'completed',
        }),
        { status: 200 }
      )
    })
    globalThis.fetch = fetchMock as typeof fetch

    const provider = createOpenAiCompatibleWhatsappLlmProvider()
    const response = await provider.generateReply({
      messages: [
        { role: 'system', content: 'Voce e o assistente da loja.' },
        { role: 'user', content: 'Tem pizza?' },
      ],
      timeoutMs: 1_000,
    })

    expect(response.text).toBe('Oi! Temos pizza disponivel hoje.')
    expect(response.provider).toBe('openai-compatible')
    expect(response.model).toBe('test-model')
    expect(response.usage.totalTokens).toBe(112)
    expect(response).not.toHaveProperty('apiKey')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://llm.example.com/respond',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer test-key',
        }),
      })
    )
  })

  test('raises a typed error when the provider is not configured', () => {
    delete process.env.WHATSAPP_ASSISTANT_LLM_API_KEY
    delete process.env.OPENAI_API_KEY

    expect(() => createOpenAiCompatibleWhatsappLlmProvider()).toThrow(
      WhatsappAssistantLlmError
    )
  })

  test('maps provider HTTP failures to typed errors', async () => {
    globalThis.fetch = mock(async () => {
      return new Response(JSON.stringify({ error: 'rate_limited' }), {
        status: 429,
      })
    }) as typeof fetch

    const provider = createOpenAiCompatibleWhatsappLlmProvider()

    try {
      await provider.generateReply({
        messages: [{ role: 'user', content: 'Oi' }],
      })
      throw new Error('expected provider error')
    } catch (error) {
      expect(error).toBeInstanceOf(WhatsappAssistantLlmError)
      expect((error as WhatsappAssistantLlmError).code).toBe(
        'provider_http_error'
      )
      expect((error as WhatsappAssistantLlmError).status).toBe(429)
    }
  })
})
