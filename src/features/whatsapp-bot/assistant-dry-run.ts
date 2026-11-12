import type { WhatsappAssistantConfigInput } from './assistant-config-policy'
import { buildDefaultWhatsappAssistantConfig } from './assistant-config-policy'
import { generateWhatsappAssistantReply } from './assistant-generation'
import type {
  WhatsappAssistantLlmProvider,
  WhatsappAssistantLlmUsage,
} from './llm-provider'
import type { WhatsappAssistantBusinessContext } from './orchestrator-policy'
import { randomUUID } from 'node:crypto'

export type WhatsappAssistantDryRunResult = {
  mode: 'dry_run'
  status: 'unavailable' | 'responded' | 'fallback' | 'handoff'
  reason: string | null
  reply: string | null
  sentToCustomer: false
  businessEffects: false
  assistantName: string
  latencyMs: number
  usage: WhatsappAssistantLlmUsage | null
}

export type WhatsappAssistantDryRunInput = {
  storeId: number
  config: WhatsappAssistantConfigInput | null
  values?: WhatsappAssistantConfigInput
  businessContext: WhatsappAssistantBusinessContext
}

export async function runWhatsappAssistantDryRun(
  input: WhatsappAssistantDryRunInput & { message: string },
  // This is an offline contract-test seam, never an application provider resolver.
  offline?: { provider: WhatsappAssistantLlmProvider; timeoutMs?: number }
): Promise<WhatsappAssistantDryRunResult> {
  const startedAt = Date.now()
  const config =
    input.values ??
    input.config ??
    buildDefaultWhatsappAssistantConfig(input.businessContext.storeName)
  const base = {
    mode: 'dry_run' as const,
    sentToCustomer: false as const,
    businessEffects: false as const,
    assistantName: config.assistantName,
    usage: null,
  }

  // Approval and a global hard budget do not exist yet. Environment credentials
  // may describe configuration, but can never authorize a paid dry-run call.
  if (!offline || process.env.NODE_ENV !== 'test') {
    const configured = Boolean(
      process.env.WHATSAPP_ASSISTANT_LLM_MODEL &&
        (process.env.WHATSAPP_ASSISTANT_LLM_API_KEY ||
          process.env.OPENAI_API_KEY)
    )
    return {
      ...base,
      status: 'unavailable',
      reason: configured ? 'budget_not_configured' : 'provider_not_configured',
      reply: null,
      latencyMs: Date.now() - startedAt,
    }
  }

  const conversationId = `dry-run:${randomUUID()}`
  const result = await generateWhatsappAssistantReply({
    assistantConfig: {
      ...config,
      id: 0,
      storeId: input.storeId,
      numberId: null,
      status: 'draft',
      metadata: {},
      updatedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    contact: { displayName: null, phoneNumber: '' },
    conversation: { mode: 'automatic', status: 'open', contextSummary: null },
    conversationId,
    assistantProviderMessageId: `${conversationId}:reply`,
    currentMessage: input.message.trim(),
    recentMessages: [],
    businessContext: input.businessContext,
    provider: offline.provider,
    timeoutMs: offline.timeoutMs,
  })
  // Never serialize native metadata, provider error messages or prompts.
  const safeFailure =
    result.failureCode === 'provider_timeout'
      ? 'provider_timeout'
      : 'provider_failed'
  return {
    ...base,
    status: result.action,
    reason: result.failureCode ? safeFailure : result.reason,
    reply: result.reply,
    usage: result.usage,
    latencyMs: Date.now() - startedAt,
  }
}
