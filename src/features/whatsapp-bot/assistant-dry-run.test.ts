import { afterEach, describe, expect, mock, test } from 'bun:test'
import {
  runWhatsappAssistantDryRun,
  type WhatsappAssistantDryRunInput,
} from './assistant-dry-run'
import { buildDefaultWhatsappAssistantConfig } from './assistant-config-policy'
import { generateWhatsappAssistantReply } from './assistant-generation'
import {
  WhatsappAssistantLlmError,
  type WhatsappAssistantLlmProvider,
} from './llm-provider'
import { buildWhatsappAssistantApprovedReplyCandidates } from './orchestrator-output-policy'

const environmentKeys = [
  'OPENAI_API_KEY',
  'WHATSAPP_ASSISTANT_LLM_API_KEY',
  'WHATSAPP_ASSISTANT_LLM_MODEL',
  'WHATSAPP_ASSISTANT_LLM_URL',
] as const
const savedEnvironment = Object.fromEntries(
  environmentKeys.map(key => [key, process.env[key]])
)
afterEach(() => {
  for (const key of environmentKeys) {
    const value = savedEnvironment[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

function fixture(): WhatsappAssistantDryRunInput & { message: string } {
  return {
    storeId: 9,
    message: 'Qual o cardapio?',
    config: null,
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
          status: 'missing',
          products: [],
          unavailableProducts: [],
          emptyReason: 'Sem produtos.',
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

describe('isolated WhatsApp assistant dry-run', () => {
  test('offline injection cannot bypass the runtime gate outside the test environment', async () => {
    const nodeEnvironment = process.env.NODE_ENV
    const generateReply = mock(() => {
      throw new Error('OFFLINE_PROVIDER_MUST_NOT_RUN')
    })
    try {
      for (const key of environmentKeys) delete process.env[key]
      for (const environment of ['production', 'development']) {
        Object.assign(process.env, { NODE_ENV: environment })
        const result = await runWhatsappAssistantDryRun(fixture(), {
          provider: { name: 'offline', model: 'offline', generateReply },
        })
        expect(result.status).toBe('unavailable')
        expect(result.reason).toBe('provider_not_configured')
        expect(result.reply).toBeNull()
      }
      expect(generateReply).not.toHaveBeenCalled()
    } finally {
      if (nodeEnvironment === undefined) delete process.env.NODE_ENV
      else Object.assign(process.env, { NODE_ENV: nodeEnvironment })
    }
  })

  test('generic key alone cannot authorize generation; configured provider is blocked by missing hard budget', async () => {
    const originalFetch = globalThis.fetch
    const fetchSpy = mock(() => {
      throw new Error('NETWORK_FORBIDDEN')
    })
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    try {
      for (const key of environmentKeys) delete process.env[key]
      expect(await runWhatsappAssistantDryRun(fixture())).toMatchObject({
        status: 'unavailable',
        reason: 'provider_not_configured',
        reply: null,
      })
      process.env.OPENAI_API_KEY = 'GENERIC_SECRET_QA'
      expect(await runWhatsappAssistantDryRun(fixture())).toMatchObject({
        status: 'unavailable',
        reason: 'provider_not_configured',
        reply: null,
      })
      process.env.WHATSAPP_ASSISTANT_LLM_MODEL = 'unapproved-model'
      const result = await runWhatsappAssistantDryRun(fixture())
      expect(result).toMatchObject({
        mode: 'dry_run',
        status: 'unavailable',
        reason: 'budget_not_configured',
        reply: null,
        businessEffects: false,
        sentToCustomer: false,
        usage: null,
      })
      process.env.WHATSAPP_ASSISTANT_LLM_API_KEY = 'DEDICATED_SECRET_QA'
      expect((await runWhatsappAssistantDryRun(fixture())).reason).toBe(
        'budget_not_configured'
      )
      expect(JSON.stringify(result)).not.toContain('SECRET_QA')
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('draft uses exactly the shared prompt/tools, with synthetic identity and no history', async () => {
    const input = fixture()
    input.values = {
      ...buildDefaultWhatsappAssistantConfig('Loja QA'),
      assistantName: 'Rascunho QA',
      additionalInstructions: 'INTERNAL_INSTRUCTIONS_QA',
    }
    const requests: Parameters<
      WhatsappAssistantLlmProvider['generateReply']
    >[0][] = []
    const provider: WhatsappAssistantLlmProvider = {
      name: 'offline',
      model: 'offline',
      generateReply: async request => {
        requests.push(request)
        return {
          text: buildWhatsappAssistantApprovedReplyCandidates(
            input.businessContext.storeTools
          )[0],
          provider: 'offline',
          model: 'offline',
          latencyMs: 1,
          usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
          finishReason: 'stop',
          toolCalls: [],
        }
      },
    }
    const result = await runWhatsappAssistantDryRun(input, { provider })
    await generateWhatsappAssistantReply({
      assistantConfig: {
        ...input.values,
        id: 0,
        storeId: 9,
        numberId: null,
        status: 'draft',
        metadata: {},
        updatedByUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      contact: { displayName: null, phoneNumber: '' },
      conversation: { mode: 'automatic', status: 'open', contextSummary: null },
      currentMessage: input.message,
      recentMessages: [],
      conversationId: 'qa',
      assistantProviderMessageId: 'qa:reply',
      businessContext: input.businessContext,
      provider,
    })
    expect(requests[0].messages).toEqual(requests[1].messages)
    expect(
      requests[0].tools?.map(tool => ({
        name: tool.name,
        inputSchema: tool.inputSchema,
      }))
    ).toEqual(
      requests[1].tools?.map(tool => ({
        name: tool.name,
        inputSchema: tool.inputSchema,
      }))
    )
    expect(requests[0].messages[0].content).toContain(
      'INTERNAL_INSTRUCTIONS_QA'
    )
    expect(result).toMatchObject({
      status: 'responded',
      assistantName: 'Rascunho QA',
      sentToCustomer: false,
      businessEffects: false,
      usage: { totalTokens: 10 },
    })
    expect(JSON.stringify(result)).not.toContain('INTERNAL_INSTRUCTIONS_QA')
    expect(Object.keys(result).sort()).toEqual(
      [
        'mode',
        'status',
        'reason',
        'reply',
        'sentToCustomer',
        'businessEffects',
        'assistantName',
        'latencyMs',
        'usage',
      ].sort()
    )
  })

  test('never exposes raw errors or internal provider metadata', async () => {
    const result = await runWhatsappAssistantDryRun(fixture(), {
      provider: {
        name: 'SECRET_PROVIDER_QA',
        model: 'SECRET_MODEL_QA',
        generateReply: async () => {
          throw new WhatsappAssistantLlmError('SECRET_RAW_PAYLOAD_QA', {
            code: 'SECRET_ERROR_CODE_QA',
          })
        },
      },
    })
    expect(result.status).toBe('fallback')
    expect(result.reason).toBe('provider_failed')
    expect(JSON.stringify(result)).not.toContain('SECRET_')
    expect(result.usage).toBeNull()
  })

  test('timeout and output rejection reuse core decisions, not static replies labelled generated', async () => {
    const timeout = await runWhatsappAssistantDryRun(
      { ...fixture(), message: 'Ola' },
      {
        timeoutMs: 10,
        provider: {
          name: 'offline',
          model: 'offline',
          generateReply: () => new Promise(() => {}),
        },
      }
    )
    expect(timeout).toMatchObject({
      status: 'handoff',
      reason: 'provider_timeout',
      sentToCustomer: false,
      businessEffects: false,
    })
    const fallback = await runWhatsappAssistantDryRun(fixture(), {
      provider: {
        name: 'offline',
        model: 'offline',
        generateReply: async () => ({
          text: 'Inventamos desconto de 90%.',
          provider: 'offline',
          model: 'offline',
          latencyMs: 0,
          usage: { inputTokens: null, outputTokens: null, totalTokens: null },
          finishReason: null,
          toolCalls: [],
        }),
      },
    })
    expect(fallback.status).toBe('fallback')
    expect(fallback.reason).toStartWith('output_policy_')
    expect(fallback.reply).not.toContain('90%')
  })
})
