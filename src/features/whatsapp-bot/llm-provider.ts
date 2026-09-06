export type WhatsappAssistantLlmMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type WhatsappAssistantLlmUsage = {
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
}

export type WhatsappAssistantLlmResponse = {
  text: string
  provider: string
  model: string
  latencyMs: number
  usage: WhatsappAssistantLlmUsage
  finishReason: string | null
}

export type WhatsappAssistantLlmProvider = {
  name: string
  model: string
  generateReply(input: {
    messages: WhatsappAssistantLlmMessage[]
    timeoutMs?: number
  }): Promise<WhatsappAssistantLlmResponse>
}

export class WhatsappAssistantLlmError extends Error {
  code: string
  status?: number

  constructor(message: string, options: { code: string; status?: number }) {
    super(message)
    this.name = 'WhatsappAssistantLlmError'
    this.code = options.code
    this.status = options.status
  }
}

const defaultOpenAiResponsesUrl = 'https://api.openai.com/v1/responses'

function getWhatsappLlmConfig() {
  const apiKey =
    process.env.WHATSAPP_ASSISTANT_LLM_API_KEY ?? process.env.OPENAI_API_KEY
  const url =
    process.env.WHATSAPP_ASSISTANT_LLM_URL ?? defaultOpenAiResponsesUrl
  const model = process.env.WHATSAPP_ASSISTANT_LLM_MODEL

  if (!apiKey || !model) {
    throw new WhatsappAssistantLlmError(
      'WhatsApp assistant LLM provider is not configured.',
      { code: 'provider_not_configured' }
    )
  }

  return { apiKey, url, model }
}

function readTextFromProviderPayload(payload: any) {
  const directText = payload?.output_text
  if (typeof directText === 'string' && directText.trim()) {
    return directText.trim()
  }

  const output = Array.isArray(payload?.output) ? payload.output : []
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : []
    for (const contentItem of content) {
      const text = contentItem?.text ?? contentItem?.output_text
      if (typeof text === 'string' && text.trim()) return text.trim()
    }
  }

  const chatText = payload?.choices?.[0]?.message?.content
  if (typeof chatText === 'string' && chatText.trim()) return chatText.trim()

  return null
}

function readUsage(payload: any): WhatsappAssistantLlmUsage {
  const usage = payload?.usage ?? {}
  const inputTokens = usage.input_tokens ?? usage.prompt_tokens ?? null
  const outputTokens = usage.output_tokens ?? usage.completion_tokens ?? null
  const totalTokens = usage.total_tokens ?? null

  return {
    inputTokens: typeof inputTokens === 'number' ? inputTokens : null,
    outputTokens: typeof outputTokens === 'number' ? outputTokens : null,
    totalTokens: typeof totalTokens === 'number' ? totalTokens : null,
  }
}

export function createOpenAiCompatibleWhatsappLlmProvider(): WhatsappAssistantLlmProvider {
  const config = getWhatsappLlmConfig()

  return {
    name: 'openai-compatible',
    model: config.model,
    async generateReply({ messages, timeoutMs = 12_000 }) {
      const startedAt = Date.now()
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const response = await fetch(config.url, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: config.model,
            input: messages.map(message => ({
              role: message.role,
              content: [
                {
                  type: 'input_text',
                  text: message.content,
                },
              ],
            })),
            temperature: 0.3,
            max_output_tokens: 450,
          }),
          signal: controller.signal,
        })

        const payload = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new WhatsappAssistantLlmError(
            `WhatsApp assistant LLM provider returned ${response.status}.`,
            { code: 'provider_http_error', status: response.status }
          )
        }

        const text = readTextFromProviderPayload(payload)
        if (!text) {
          throw new WhatsappAssistantLlmError(
            'WhatsApp assistant LLM provider returned an empty response.',
            { code: 'provider_empty_response' }
          )
        }

        return {
          text,
          provider: this.name,
          model: config.model,
          latencyMs: Date.now() - startedAt,
          usage: readUsage(payload),
          finishReason:
            payload?.finish_reason ??
            payload?.choices?.[0]?.finish_reason ??
            payload?.status ??
            null,
        }
      } catch (error) {
        if (error instanceof WhatsappAssistantLlmError) throw error

        if (error instanceof Error && error.name === 'AbortError') {
          throw new WhatsappAssistantLlmError(
            'WhatsApp assistant LLM provider timed out.',
            { code: 'provider_timeout' }
          )
        }

        throw new WhatsappAssistantLlmError(
          'WhatsApp assistant LLM provider failed.',
          { code: 'provider_failed' }
        )
      } finally {
        clearTimeout(timeout)
      }
    },
  }
}
