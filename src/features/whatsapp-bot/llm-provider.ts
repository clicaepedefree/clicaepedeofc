export type WhatsappAssistantLlmMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type WhatsappAssistantLlmUsage = {
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
}

export type WhatsappAssistantLlmTool = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  execute(argumentsValue: Record<string, unknown>): Promise<unknown> | unknown
}

export type WhatsappAssistantLlmResponse = {
  text: string
  provider: string
  model: string
  latencyMs: number
  usage: WhatsappAssistantLlmUsage
  finishReason: string | null
  toolCalls: {
    name: string
    ok: boolean
  }[]
}

export type WhatsappAssistantLlmProvider = {
  name: string
  model: string
  generateReply(input: {
    messages: WhatsappAssistantLlmMessage[]
    tools?: WhatsappAssistantLlmTool[]
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

function addUsage(
  current: WhatsappAssistantLlmUsage,
  next: WhatsappAssistantLlmUsage
): WhatsappAssistantLlmUsage {
  return {
    inputTokens:
      current.inputTokens === null && next.inputTokens === null
        ? null
        : (current.inputTokens ?? 0) + (next.inputTokens ?? 0),
    outputTokens:
      current.outputTokens === null && next.outputTokens === null
        ? null
        : (current.outputTokens ?? 0) + (next.outputTokens ?? 0),
    totalTokens:
      current.totalTokens === null && next.totalTokens === null
        ? null
        : (current.totalTokens ?? 0) + (next.totalTokens ?? 0),
  }
}

function toProviderInput(messages: WhatsappAssistantLlmMessage[]) {
  return messages.map(message => ({
    role: message.role,
    content: [
      {
        type: 'input_text',
        text: message.content,
      },
    ],
  }))
}

function toProviderTools(tools: WhatsappAssistantLlmTool[] | undefined) {
  if (!tools?.length) return undefined

  return tools.map(tool => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
  }))
}

function readFunctionCalls(payload: any) {
  const output: unknown[] = Array.isArray(payload?.output) ? payload.output : []

  return output.filter((item): item is {
    type: 'function_call'
    name: string
    call_id: string
    arguments?: unknown
  } => {
    if (!item || typeof item !== 'object') return false
    const value = item as Record<string, unknown>
    return (
      value.type === 'function_call' &&
      typeof value.name === 'string' &&
      typeof value.call_id === 'string'
    )
  })
}

function parseToolArguments(value: unknown): Record<string, unknown> {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value !== 'string') return {}

  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {}
  } catch {
    return {}
  }
}

export function createOpenAiCompatibleWhatsappLlmProvider(): WhatsappAssistantLlmProvider {
  const config = getWhatsappLlmConfig()

  return {
    name: 'openai-compatible',
    model: config.model,
    async generateReply({ messages, tools, timeoutMs = 12_000 }) {
      const startedAt = Date.now()
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      const providerTools = toProviderTools(tools)
      const toolMap = new Map(tools?.map(tool => [tool.name, tool]) ?? [])
      const toolCalls: WhatsappAssistantLlmResponse['toolCalls'] = []
      let usage: WhatsappAssistantLlmUsage = {
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
      }

      try {
        const providerInput = toProviderInput(messages)
        const response = await fetch(config.url, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: config.model,
            input: providerInput,
            ...(providerTools ? { tools: providerTools } : {}),
            temperature: 0.3,
            max_output_tokens: 450,
          }),
          signal: controller.signal,
        })

        let payload = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new WhatsappAssistantLlmError(
            `WhatsApp assistant LLM provider returned ${response.status}.`,
            { code: 'provider_http_error', status: response.status }
          )
        }

        usage = addUsage(usage, readUsage(payload))
        const functionCalls = readFunctionCalls(payload)

        if (functionCalls.length > 0 && toolMap.size > 0) {
          const toolOutputs = []

          for (const call of functionCalls.slice(0, 4)) {
            const tool = toolMap.get(call.name)
            if (!tool) continue

            try {
              const result = await tool.execute(parseToolArguments(call.arguments))
              toolCalls.push({ name: tool.name, ok: true })
              toolOutputs.push({
                type: 'function_call_output',
                call_id: call.call_id,
                output: JSON.stringify({ ok: true, result }),
              })
            } catch (error) {
              toolCalls.push({ name: tool.name, ok: false })
              toolOutputs.push({
                type: 'function_call_output',
                call_id: call.call_id,
                output: JSON.stringify({
                  ok: false,
                  error:
                    error instanceof Error
                      ? error.message
                      : 'tool_execution_failed',
                }),
              })
            }
          }

          if (toolOutputs.length > 0) {
            const followUpResponse = await fetch(config.url, {
              method: 'POST',
              headers: {
                authorization: `Bearer ${config.apiKey}`,
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                model: config.model,
                input: [...providerInput, ...functionCalls, ...toolOutputs],
                temperature: 0.3,
                max_output_tokens: 450,
              }),
              signal: controller.signal,
            })

            const followUpPayload = await followUpResponse.json().catch(() => ({}))
            if (!followUpResponse.ok) {
              throw new WhatsappAssistantLlmError(
                `WhatsApp assistant LLM provider returned ${followUpResponse.status}.`,
                {
                  code: 'provider_http_error',
                  status: followUpResponse.status,
                }
              )
            }

            usage = addUsage(usage, readUsage(followUpPayload))
            payload = followUpPayload
          }
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
          usage,
          finishReason:
            payload?.finish_reason ??
            payload?.choices?.[0]?.finish_reason ??
            payload?.status ??
            null,
          toolCalls,
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
