import { describe, expect, mock, test } from 'bun:test'
import { buildDefaultWhatsappAssistantConfig } from './assistant-config-policy'
import {
  generateWhatsappAssistantReply,
  type WhatsappAssistantGenerationInput,
} from './assistant-generation'
import {
  WhatsappAssistantLlmError,
  type WhatsappAssistantLlmProvider,
  type WhatsappAssistantLlmResponse,
} from './llm-provider'
import {
  buildWhatsappAssistantApprovedReplyCandidates,
  whatsappAssistantOutputFallback,
} from './orchestrator-output-policy'
import { whatsappAssistantStoreToolDefinitions } from './store-tools-policy'

function fixture(): WhatsappAssistantGenerationInput {
  return {
    assistantConfig: {
      ...buildDefaultWhatsappAssistantConfig('Loja QA'),
      assistantName: 'Assistente QA',
      tone: 'professional',
      responseLength: 'short',
      emojiUsage: 'none',
      additionalInstructions: 'Priorize o cardapio.',
      id: 1,
      storeId: 9,
      numberId: null,
      status: 'active',
      updatedByUserId: null,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    contact: { displayName: null, phoneNumber: '' },
    conversation: { mode: 'automatic', status: 'open', contextSummary: null },
    currentMessage: 'Qual o cardapio?',
    recentMessages: [],
    conversationId: 'conversation-qa',
    assistantProviderMessageId: 'assistant:qa',
    businessContext: {
      storeName: 'Loja QA',
      digitalMenu: null,
      businessHours: [],
      paymentMethods: [],
      menuItems: [],
      storeTools: {
        scope: 'conversation_store',
        store: {
          name: 'Loja QA',
          subdomain: 'qa',
          digitalMenuUrl: 'https://example.test/cardapio/qa',
        },
        menu: {
          status: 'known',
          emptyReason: null,
          unavailableProducts: [],
          products: [
            {
              itemOfferingId: 1,
              itemId: 2,
              categoryName: 'Lanches',
              name: 'Lanche QA',
              description: null,
              price: '15.00',
              originalPrice: null,
              inventory: null,
              externalCode: null,
              optionGroups: [],
              availabilityStatus: 'available',
              unavailableReason: null,
            },
          ],
        },
        operations: {
          digitalMenu: null,
          businessHours: [],
          modalities: { delivery: false, takeout: false, scheduled: false },
        },
        payments: [],
      },
    },
  }
}

function response(text: string): WhatsappAssistantLlmResponse {
  return {
    text,
    provider: 'offline',
    model: 'offline',
    latencyMs: 1,
    usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
    finishReason: 'stop',
    toolCalls: [],
  }
}

describe('shared WhatsApp assistant generation', () => {
  test('passes real configuration, approved prompt, server tools and the native 12-second timeout', async () => {
    const input = fixture()
    const approved = buildWhatsappAssistantApprovedReplyCandidates(
      input.businessContext.storeTools
    )
    const generateReply = mock(
      async (
        request: Parameters<WhatsappAssistantLlmProvider['generateReply']>[0]
      ) => {
        expect(request.timeoutMs).toBe(12_000)
        const prompt = request.messages[0].content
        for (const value of [
          'Assistente QA',
          'professional',
          'short',
          'none',
          'Priorize o cardapio.',
          input.assistantConfig.greetingMessage,
          input.assistantConfig.fallbackMessage,
          JSON.stringify(approved),
        ]) {
          expect(prompt).toContain(value)
        }
        expect(request.messages[1].content).toContain(input.currentMessage)
        expect(request.tools?.map(tool => tool.name)).toEqual(
          whatsappAssistantStoreToolDefinitions.map(tool => tool.name)
        )
        for (const tool of request.tools ?? []) {
          expect(JSON.stringify(tool.inputSchema)).not.toContain('storeId')
          expect(
            JSON.stringify(
              await tool.execute({ storeId: 999, query: 'Lanche' })
            )
          ).not.toContain('Outra loja')
        }
        return response(approved[0])
      }
    )
    const result = await generateWhatsappAssistantReply({
      ...input,
      provider: { name: 'offline', model: 'offline', generateReply },
    })
    expect(result.action).toBe('responded')
    expect(result.reply).toContain(approved[0])
    expect(result.reply).toContain('https://example.test/cardapio/qa')
    expect(result.usage?.totalTokens).toBe(30)
    expect(generateReply).toHaveBeenCalledTimes(1)
  })

  test('untrusted output falls back through the existing guard', async () => {
    const result = await generateWhatsappAssistantReply({
      ...fixture(),
      provider: {
        name: 'offline',
        model: 'offline',
        generateReply: async () =>
          response('Frete gratis garantido. SECRET_QA.'),
      },
    })
    expect(result.action).toBe('fallback')
    expect(result.reason).toStartWith('output_policy_')
    expect(result.reply).toContain(whatsappAssistantOutputFallback)
    expect(result.reply).not.toContain('SECRET_QA')
  })

  test('freezes output authority before exposing mutable objects to a provider', async () => {
    const input = fixture()
    const result = await generateWhatsappAssistantReply({
      ...input,
      provider: {
        name: 'offline',
        model: 'offline',
        generateReply: async () => {
          input.businessContext.storeTools!.menu.products[0].name = 'Inventado'
          input.businessContext.storeTools!.menu.products[0].price = '999.00'
          return response(
            buildWhatsappAssistantApprovedReplyCandidates(
              input.businessContext.storeTools
            ).find(text => text.includes('Inventado'))!
          )
        },
      },
    })
    expect(result.action).toBe('fallback')
    expect(result.reply).not.toContain('Inventado')
    expect(result.reply).not.toContain('999')
  })

  test('returns handoff as a decision without invoking generation', async () => {
    const generateReply = mock(async () => response('unused'))
    const result = await generateWhatsappAssistantReply({
      ...fixture(),
      currentMessage: 'Quero falar com um atendente humano',
      provider: { name: 'offline', model: 'offline', generateReply },
    })
    expect(result.action).toBe('handoff')
    expect(result.handoffDecision.shouldHandoff).toBe(true)
    expect(result.usage).toBeNull()
    expect(generateReply).not.toHaveBeenCalled()
  })

  test('bounds an injected provider that never settles and returns the existing failure handoff', async () => {
    const startedAt = Date.now()
    const result = await generateWhatsappAssistantReply({
      ...fixture(),
      currentMessage: 'Ola',
      timeoutMs: 10,
      provider: {
        name: 'offline',
        model: 'offline',
        generateReply: () => new Promise(() => {}),
      },
    })
    expect(Date.now() - startedAt).toBeLessThan(1_000)
    expect(result.failureCode).toBe('provider_timeout')
    expect(result.action).toBe('handoff')
    expect(result.fallbackHandoffDecision?.shouldHandoff).toBe(true)
  })

  test('keeps native failure metadata internal and uses the existing fallback', async () => {
    const result = await generateWhatsappAssistantReply({
      ...fixture(),
      provider: {
        name: 'offline',
        model: 'offline',
        generateReply: async () => {
          throw new WhatsappAssistantLlmError('PRIVATE_ERROR_QA', {
            code: 'provider_http_error',
          })
        },
      },
    })
    expect(result.reason).toBe('PRIVATE_ERROR_QA')
    expect(result.failureCode).toBe('provider_http_error')
    expect(result.reply).not.toContain('PRIVATE_ERROR_QA')
    expect(result.action).toBe('fallback')
  })
})
