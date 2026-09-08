export type DigitalMenuAttribution = {
  source: 'whatsapp_bot'
  medium: 'assistant'
  campaign: 'digital_menu_cta'
  conversationId: string
  messageId?: string
  entryUrl?: string
}

export type DigitalMenuAttributionInput = {
  source?: string
  medium?: string
  campaign?: string
  conversationId?: string
  messageId?: string
  entryUrl?: string
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const cleanText = (value: unknown, max = 240) =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''

const cleanEntryUrl = (value: unknown) => {
  const rawValue = cleanText(value, 500)
  if (!rawValue) return undefined

  try {
    const url = new URL(rawValue)
    return url.toString()
  } catch {
    return undefined
  }
}

export const normalizeDigitalMenuAttribution = (
  input?: DigitalMenuAttributionInput | null
): DigitalMenuAttribution | null => {
  if (!input) return null

  const source = cleanText(input.source, 80)
  const medium = cleanText(input.medium, 80)
  const campaign = cleanText(input.campaign, 120)
  const conversationId = cleanText(input.conversationId, 80)

  if (
    source !== 'whatsapp_bot' ||
    medium !== 'assistant' ||
    campaign !== 'digital_menu_cta' ||
    !uuidPattern.test(conversationId)
  ) {
    return null
  }

  const messageId = cleanText(input.messageId, 160)
  const entryUrl = cleanEntryUrl(input.entryUrl)

  return {
    source,
    medium,
    campaign,
    conversationId,
    ...(messageId ? { messageId } : {}),
    ...(entryUrl ? { entryUrl } : {}),
  }
}

export const parseDigitalMenuAttributionSearchParams = (
  searchParams: URLSearchParams,
  entryUrl?: string
) =>
  normalizeDigitalMenuAttribution({
    source: searchParams.get('utm_source') ?? undefined,
    medium: searchParams.get('utm_medium') ?? undefined,
    campaign: searchParams.get('utm_campaign') ?? undefined,
    conversationId: searchParams.get('wa_conversation') ?? undefined,
    messageId: searchParams.get('wa_message') ?? undefined,
    entryUrl,
  })
