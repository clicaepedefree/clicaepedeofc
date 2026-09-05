import { z } from 'zod'

export const assistantToneOptions = [
  'friendly',
  'professional',
  'casual',
  'direct',
] as const

export const assistantResponseLengthOptions = [
  'short',
  'medium',
  'detailed',
] as const

export const assistantEmojiUsageOptions = [
  'none',
  'light',
  'expressive',
] as const

export const assistantConfigLimits = {
  assistantName: 40,
  greetingMessage: 280,
  fallbackMessage: 280,
  additionalInstructions: 1200,
  testMessage: 500,
} as const

const unsafeInstructionPatterns = [
  /ignore (as )?(instru[cç][oõ]es|regras|prompt)/i,
  /ignore (all|previous|system|developer) instructions/i,
  /(revel|mostr|exib).*(prompt|segredo|token|senha|credencial|apikey|api key)/i,
  /(system prompt|developer message|hidden instruction)/i,
  /(aja|finja|responda).*(humano|pessoa real)/i,
  /nao (diga|informe|revele).*(assistente|bot|virtual)/i,
  /(bypass|jailbreak|desativ).*(seguran[cç]a|permiss[oõ]es|guardrails)/i,
]

const textWithLimit = (field: keyof typeof assistantConfigLimits) =>
  z.string().trim().max(assistantConfigLimits[field])

export const whatsappAssistantConfigInputSchema = z.object({
  assistantName: textWithLimit('assistantName').min(
    2,
    'Informe um nome com pelo menos 2 caracteres.'
  ),
  greetingMessage: textWithLimit('greetingMessage').min(
    10,
    'A saudacao precisa explicar como o assistente ajuda.'
  ),
  fallbackMessage: textWithLimit('fallbackMessage').min(
    10,
    'Informe uma mensagem de fallback para atendimento humano.'
  ),
  tone: z.enum(assistantToneOptions),
  responseLength: z.enum(assistantResponseLengthOptions),
  emojiUsage: z.enum(assistantEmojiUsageOptions),
  additionalInstructions: z
    .preprocess(
      value => (value === null ? undefined : value),
      textWithLimit('additionalInstructions').optional()
    )
    .transform(value => value || null),
  testModeEnabled: z.boolean(),
})

export type WhatsappAssistantConfigInput = z.infer<
  typeof whatsappAssistantConfigInputSchema
>

export type WhatsappAssistantConfigSnapshot = WhatsappAssistantConfigInput & {
  id: number
  storeId: number
  storeName: string
  numberId: number | null
  status: 'draft' | 'active' | 'paused'
  updatedAt: Date | null
}

export const hasUnsafeAssistantInstruction = (value?: string | null) => {
  if (!value) return false

  return unsafeInstructionPatterns.some(pattern => pattern.test(value))
}

export const validateWhatsappAssistantConfigInput = (input: unknown) => {
  const parsed = whatsappAssistantConfigInputSchema.safeParse(input)

  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues[0]?.message ?? 'Dados invalidos.',
    }
  }

  const fieldsToInspect = [
    parsed.data.assistantName,
    parsed.data.greetingMessage,
    parsed.data.fallbackMessage,
    parsed.data.additionalInstructions,
  ]

  if (fieldsToInspect.some(hasUnsafeAssistantInstruction)) {
    return {
      success: false as const,
      error:
        'As instrucoes nao podem pedir para ignorar regras, ocultar que e assistente ou revelar credenciais.',
    }
  }

  return { success: true as const, data: parsed.data }
}

export const buildDefaultWhatsappAssistantConfig = (
  storeName: string
): WhatsappAssistantConfigInput => ({
  assistantName: 'Assistente virtual',
  greetingMessage: `Oi! Eu sou o assistente virtual da ${storeName}. Posso te ajudar com cardapio, horarios, pagamentos e pedidos.`,
  fallbackMessage:
    'Nao tenho certeza sobre isso. Posso chamar uma pessoa da equipe para ajudar.',
  tone: 'friendly',
  responseLength: 'medium',
  emojiUsage: 'light',
  additionalInstructions: null,
  testModeEnabled: true,
})

const toneLabels: Record<WhatsappAssistantConfigInput['tone'], string> = {
  friendly: 'simpatico',
  professional: 'profissional',
  casual: 'casual',
  direct: 'direto',
}

const lengthGuidance: Record<
  WhatsappAssistantConfigInput['responseLength'],
  string
> = {
  short: 'Vou responder de forma curta.',
  medium: 'Vou responder com objetividade e contexto suficiente.',
  detailed: 'Vou responder com mais detalhes quando isso ajudar.',
}

const emojiGuidance: Record<
  WhatsappAssistantConfigInput['emojiUsage'],
  string
> = {
  none: 'Sem emojis.',
  light: 'Uso emojis apenas quando combinarem com a conversa.',
  expressive: 'Posso usar emojis com mais presenca, mantendo clareza.',
}

export const buildWhatsappAssistantTestReply = ({
  config,
  storeName,
  customerMessage,
}: {
  config: WhatsappAssistantConfigInput
  storeName: string
  customerMessage: string
}) => {
  const normalizedMessage = customerMessage.trim().toLowerCase()
  const shouldIdentify =
    normalizedMessage.includes('quem e voce') ||
    normalizedMessage.includes('quem é você') ||
    normalizedMessage.includes('voce e humano') ||
    normalizedMessage.includes('você é humano') ||
    normalizedMessage.includes('assistente')

  const identity = `Sou ${config.assistantName}, assistente virtual da ${storeName}.`
  const intro = shouldIdentify ? identity : config.greetingMessage
  const fallback =
    normalizedMessage.length === 0
      ? config.fallbackMessage
      : 'Posso consultar informacoes da loja, cardapio, promocoes, horarios, pagamentos e status do pedido.'

  return [
    intro,
    `Tom: ${toneLabels[config.tone]}. ${lengthGuidance[config.responseLength]} ${emojiGuidance[config.emojiUsage]}`,
    config.additionalInstructions
      ? `Instrucao interna aplicada: ${config.additionalInstructions}`
      : null,
    fallback,
    'Esta e uma simulacao interna; nenhuma mensagem foi enviada ao cliente.',
  ]
    .filter(Boolean)
    .join('\n\n')
}
