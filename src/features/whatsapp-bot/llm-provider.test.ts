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
    expect(response.toolCalls).toEqual([])
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

  test('executes provider tool calls and asks for a final answer with tool output', async () => {
    const fetchMock = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      if (body.tools) {
        return new Response(
          JSON.stringify({
            output: [
              {
                type: 'function_call',
                call_id: 'call_1',
                name: 'search_menu_items',
                arguments: '{"query":"pizza"}',
              },
            ],
            usage: { input_tokens: 80, output_tokens: 8, total_tokens: 88 },
            status: 'requires_action',
          }),
          { status: 200 }
        )
      }

      return new Response(
        JSON.stringify({
          output_text: 'Temos Pizza QA por R$ 39,90.',
          usage: { input_tokens: 120, output_tokens: 14, total_tokens: 134 },
          status: 'completed',
        }),
        { status: 200 }
      )
    })
    globalThis.fetch = fetchMock as typeof fetch

    const provider = createOpenAiCompatibleWhatsappLlmProvider()
    const response = await provider.generateReply({
      messages: [{ role: 'user', content: 'Tem pizza?' }],
      tools: [
        {
          name: 'search_menu_items',
          description: 'Busca produtos da loja da conversa.',
          inputSchema: {
            type: 'object',
            additionalProperties: false,
            properties: { query: { type: 'string' } },
          },
          execute: argumentsValue => ({
            query: argumentsValue.query,
            products: [{ name: 'Pizza QA', price: '39.9000' }],
          }),
        },
      ],
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(response.text).toBe('Temos Pizza QA por R$ 39,90.')
    expect(response.toolCalls).toEqual([{ name: 'search_menu_items', ok: true }])
    expect(response.usage.totalTokens).toBe(222)
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
