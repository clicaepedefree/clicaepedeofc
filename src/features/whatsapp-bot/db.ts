import { decrypt, encrypt } from '@/lib/encryption'
import { getOptionGroupsByItemOfferingIds } from '@/features/option-groups/db'
import { db } from '@/services/db'
import {
  categoriesTable,
  itemOfferingsTable,
  itemsTable,
  storeBusinessHoursTable,
  storeDigitalMenuSettingsTable,
  storePaymentMethodsTable,
  storesTable,
  whatsappBotAssistantConfigsTable,
  whatsappBotContactsTable,
  whatsappBotConversationsTable,
  whatsappBotMessagesTable,
  whatsappBotNumbersTable,
  whatsappBotSessionsTable,
  userStorePermissionsTable,
  usersTable,
  type SelectWhatsappBotAssistantConfig,
  type SelectWhatsappBotContact,
  type SelectWhatsappBotConversation,
  type SelectWhatsappBotMessage,
  type SelectWhatsappBotNumber,
  type SelectWhatsappBotSession,
} from '@/services/db/schema'
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm'

import {
  buildEvolutionInstanceName,
  buildEvolutionWebhookUrl,
  buildWhatsappSessionNonce,
  normalizeEvolutionConnectionDecision,
  resolveReconnectPlan,
  resolveQrCodeExpiresAt,
  shouldApplyEvolutionSessionEvent,
  whatsappBotProvider,
  type WhatsappBotSessionStatus,
} from './session-policy'
import {
  createEvolutionClient,
  type EvolutionClient,
  type EvolutionInstanceResult,
  type EvolutionQrCode,
} from './evolution-client'
import {
  buildDefaultWhatsappAssistantConfig,
  buildWhatsappAssistantTestReply,
  type WhatsappAssistantConfigInput,
  type WhatsappAssistantConfigSnapshot,
} from './assistant-config-policy'
import {
  buildContactIngestionMetadata,
  detectPromotionalOptOut,
  normalizeWhatsappPhoneNumber,
  type WhatsappBotInboundMessageType,
} from './contact-ingestion-policy'
import {
  createOpenAiCompatibleWhatsappLlmProvider,
  type WhatsappAssistantLlmProvider,
} from './llm-provider'
import {
  appendWhatsappDigitalMenuCta,
  decideWhatsappDigitalMenuCta,
} from './digital-menu-cta-policy'
import {
  buildWhatsappAssistantSystemPrompt,
  buildWhatsappAssistantUserPrompt,
  buildWhatsappHumanHandoffReply,
  canWhatsappAssistantRespond,
  classifyWhatsappAssistantIntent,
  estimateWhatsappAssistantTokens,
  trimWhatsappAssistantHistory,
} from './orchestrator-policy'
import {
  buildWhatsappHumanHandoffContextSummary,
  buildWhatsappHumanHandoffInternalNote,
  detectWhatsappHumanHandoff,
  getWhatsappHumanHandoffReasonLabel,
  type WhatsappHumanHandoffDecision,
} from './human-handoff-policy'
import {
  createWhatsappAssistantStoreTools,
  resolveWhatsappAssistantModalities,
  resolveWhatsappAssistantProductAvailability,
  type WhatsappAssistantStoreToolProduct,
} from './store-tools-policy'
import { getPublicAppBaseUrl } from '@/shared/lib/domain-config'
import { randomUUID } from 'node:crypto'

type SessionMetadata = Record<string, unknown> & {
  provider?: 'evolution'
  instanceTokenCiphertext?: string
  qrCode?: {
    base64: string | null
    count: number | null
    expiresAt: string
  } | null
  webhookUrl?: string
  reconnectRequestedAt?: string
  reconnectAttemptCount?: number
  lastReconnectAttemptAt?: string
  reconnectSkippedReason?: string
  connectionNonce?: string
  lastProviderState?: string | null
  lastProviderPayload?: unknown
}

type WhatsappSessionSnapshot = {
  id: number
  storeId: number
  numberId: number
  providerSessionId: string
  status: WhatsappBotSessionStatus
  qrCodeBase64: string | null
  qrCodeExpiresAt: Date | null
  lastErrorCode: string | null
  lastErrorMessage: string | null
  connectedAt: Date | null
  disconnectedAt: Date | null
  lastHeartbeatAt: Date | null
  updatedAt: Date | null
  phoneNumber: string | null
  displayName: string | null
}

type WhatsappInboundMessageProcessingResult = {
  contact: SelectWhatsappBotContact
  conversation: SelectWhatsappBotConversation
  message: SelectWhatsappBotMessage | null
  messageCreated: boolean
}

type WhatsappAssistantOrchestrationResult = {
  action: 'responded' | 'fallback' | 'skipped' | 'handoff'
  reason: string | null
  intent: ReturnType<typeof classifyWhatsappAssistantIntent>
  outboundMessageId: string | null
  latencyMs: number | null
  deliveryStatus: 'not_sent' | 'sent' | 'failed'
}

export type WhatsappHumanHandoffConversation = {
  id: string
  status: SelectWhatsappBotConversation['status']
  mode: SelectWhatsappBotConversation['mode']
  contextSummary: string | null
  humanPausedAt: Date | null
  returnedToBotAt: Date | null
  lastMessageAt: Date | null
  updatedAt: Date | null
  contact: {
    id: number
    displayName: string | null
    phoneNumber: string
    firstContactAt: Date
    lastContactAt: Date
  }
  handoff: {
    reason: string | null
    reasonLabel: string
    confidence: string | null
    notifiedAt: string | null
    responsible: {
      userId: string | null
      name: string | null
      email: string | null
      phone: string | null
    } | null
  }
  messages: {
    id: string
    direction: SelectWhatsappBotMessage['direction']
    senderType: SelectWhatsappBotMessage['senderType']
    messageType: SelectWhatsappBotMessage['messageType']
    body: string | null
    status: SelectWhatsappBotMessage['status']
    occurredAt: Date
  }[]
}

const toMetadata = (metadata: unknown): SessionMetadata =>
  metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as SessionMetadata)
    : {}

const redactProviderPayload = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') return payload

  const value = payload as Record<string, unknown>
  return {
    instance: value.instance,
    event: value.event,
    state: value.state,
    connectionStatus: value.connectionStatus,
    qrcode: value.qrcode ? '[redacted]' : undefined,
    qrCode: value.qrCode ? '[redacted]' : undefined,
  }
}

const getSessionToken = (session: SelectWhatsappBotSession) => {
  const metadata = toMetadata(session.metadata)
  const encryptedToken = metadata.instanceTokenCiphertext

  if (typeof encryptedToken !== 'string' || !encryptedToken) return null

  return decrypt(encryptedToken)
}

const getWhatsappHumanHandoffResponsible = async (storeId: number) => {
  const [responsible] = await db
    .select({
      userId: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      phone: usersTable.phone,
    })
    .from(userStorePermissionsTable)
    .innerJoin(usersTable, eq(usersTable.id, userStorePermissionsTable.userId))
    .where(
      and(
        eq(userStorePermissionsTable.storeId, storeId),
        eq(userStorePermissionsTable.role, 'owner'),
        eq(userStorePermissionsTable.isPrimaryResponsible, true),
        sql`${userStorePermissionsTable.revokedAt} is null`,
        eq(usersTable.status, 'active')
      )
    )
    .limit(1)

  return responsible ?? null
}

const getHumanHandoffMetadata = (
  metadata: unknown
): {
  reason?: string
  reasonLabel?: string
  confidence?: string
  notifiedAt?: string
  responsible?: {
    userId?: string | null
    name?: string | null
    email?: string | null
    phone?: string | null
  } | null
} => {
  const value =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as { humanHandoff?: unknown })
      : {}
  const handoff =
    value.humanHandoff &&
    typeof value.humanHandoff === 'object' &&
    !Array.isArray(value.humanHandoff)
      ? (value.humanHandoff as Record<string, unknown>)
      : {}
  const responsible =
    handoff.responsible &&
    typeof handoff.responsible === 'object' &&
    !Array.isArray(handoff.responsible)
      ? (handoff.responsible as Record<string, unknown>)
      : null

  return {
    reason: typeof handoff.reason === 'string' ? handoff.reason : undefined,
    reasonLabel:
      typeof handoff.reasonLabel === 'string' ? handoff.reasonLabel : undefined,
    confidence:
      typeof handoff.confidence === 'string' ? handoff.confidence : undefined,
    notifiedAt:
      typeof handoff.notifiedAt === 'string' ? handoff.notifiedAt : undefined,
    responsible: responsible
      ? {
          userId:
            typeof responsible.userId === 'string' ? responsible.userId : null,
          name: typeof responsible.name === 'string' ? responsible.name : null,
          email:
            typeof responsible.email === 'string' ? responsible.email : null,
          phone:
            typeof responsible.phone === 'string' ? responsible.phone : null,
        }
      : null,
  }
}

const buildSessionMetadata = ({
  currentMetadata,
  evolutionResult,
  webhookUrl,
  qrCodeExpiresAt,
}: {
  currentMetadata?: unknown
  evolutionResult: EvolutionInstanceResult
  webhookUrl?: string
  qrCodeExpiresAt?: Date | null
}): SessionMetadata => {
  const metadata = toMetadata(currentMetadata)
  const tokenMetadata = evolutionResult.token
    ? { instanceTokenCiphertext: encrypt(evolutionResult.token) }
    : {}

  return {
    ...metadata,
    ...tokenMetadata,
    provider: whatsappBotProvider,
    webhookUrl: webhookUrl ?? metadata.webhookUrl,
    connectionNonce: buildWhatsappSessionNonce(),
    lastProviderState: evolutionResult.state,
    lastProviderPayload: redactProviderPayload(evolutionResult.raw),
    qrCode: evolutionResult.qrCode
      ? {
          base64: evolutionResult.qrCode.base64,
          count: evolutionResult.qrCode.count,
          expiresAt: (
            qrCodeExpiresAt ?? resolveQrCodeExpiresAt()
          ).toISOString(),
        }
      : null,
  }
}

const toSessionSnapshot = (
  session: SelectWhatsappBotSession,
  number?: Pick<SelectWhatsappBotNumber, 'phoneNumber' | 'displayName'> | null
): WhatsappSessionSnapshot => {
  const metadata = toMetadata(session.metadata)
  const qrCode = metadata.qrCode

  return {
    id: session.id,
    storeId: session.storeId,
    numberId: session.numberId,
    providerSessionId: session.providerSessionId,
    status: session.status,
    qrCodeBase64:
      qrCode && typeof qrCode === 'object'
        ? ((qrCode as { base64?: string | null }).base64 ?? null)
        : null,
    qrCodeExpiresAt: session.qrCodeExpiresAt,
    lastErrorCode: session.lastErrorCode,
    lastErrorMessage: session.lastErrorMessage,
    connectedAt: session.connectedAt,
    disconnectedAt: session.disconnectedAt,
    lastHeartbeatAt: session.lastHeartbeatAt,
    updatedAt: session.updatedAt,
    phoneNumber: number?.phoneNumber ?? null,
    displayName: number?.displayName ?? null,
  }
}

const getNumberForSession = async (session: SelectWhatsappBotSession) => {
  const [number] = await db
    .select()
    .from(whatsappBotNumbersTable)
    .where(
      and(
        eq(whatsappBotNumbersTable.id, session.numberId),
        eq(whatsappBotNumbersTable.storeId, session.storeId)
      )
    )
    .limit(1)

  return number ?? null
}

const toAssistantConfigSnapshot = (
  config: SelectWhatsappBotAssistantConfig,
  storeName: string
): WhatsappAssistantConfigSnapshot => ({
  id: config.id,
  storeId: config.storeId,
  storeName,
  numberId: config.numberId,
  assistantName: config.assistantName,
  greetingMessage: config.greetingMessage,
  fallbackMessage: config.fallbackMessage,
  tone: config.tone,
  responseLength: config.responseLength,
  emojiUsage: config.emojiUsage,
  additionalInstructions: config.additionalInstructions,
  testModeEnabled: config.testModeEnabled,
  status: config.status,
  updatedAt: config.updatedAt,
})

const getStoreOrThrow = async (storeId: number) => {
  const [store] = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.id, storeId))
    .limit(1)

  if (!store) throw new Error('STORE_NOT_FOUND')

  return store
}

export async function getWhatsappAssistantConfigForStore(storeId: number) {
  const store = await getStoreOrThrow(storeId)
  const [config] = await db
    .select()
    .from(whatsappBotAssistantConfigsTable)
    .where(eq(whatsappBotAssistantConfigsTable.storeId, storeId))
    .limit(1)

  if (config) return toAssistantConfigSnapshot(config, store.name)

  const defaultConfig = buildDefaultWhatsappAssistantConfig(store.name)
  const [createdConfig] = await db
    .insert(whatsappBotAssistantConfigsTable)
    .values({
      storeId,
      ...defaultConfig,
      status: 'draft',
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [whatsappBotAssistantConfigsTable.storeId],
      set: {
        ...defaultConfig,
        status: 'draft',
        updatedAt: new Date(),
      },
    })
    .returning()

  return toAssistantConfigSnapshot(createdConfig, store.name)
}

export async function saveWhatsappAssistantConfigForStore({
  storeId,
  values,
  updatedByUserId,
}: {
  storeId: number
  values: WhatsappAssistantConfigInput
  updatedByUserId: string
}) {
  const store = await getStoreOrThrow(storeId)

  const [config] = await db
    .insert(whatsappBotAssistantConfigsTable)
    .values({
      storeId,
      ...values,
      status: values.testModeEnabled ? 'draft' : 'active',
      updatedByUserId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [whatsappBotAssistantConfigsTable.storeId],
      set: {
        ...values,
        status: values.testModeEnabled ? 'draft' : 'active',
        updatedByUserId,
        updatedAt: new Date(),
      },
    })
    .returning()

  return toAssistantConfigSnapshot(config, store.name)
}

export async function testWhatsappAssistantConfigForStore({
  storeId,
  message,
}: {
  storeId: number
  message: string
}) {
  const store = await getStoreOrThrow(storeId)
  const config = await getWhatsappAssistantConfigForStore(storeId)

  return {
    reply: buildWhatsappAssistantTestReply({
      config,
      storeName: store.name,
      customerMessage: message,
    }),
    sentToCustomer: false,
  }
}

export async function getWhatsappHumanHandoffQueueForStore(storeId: number) {
  const conversations = await db
    .select({
      id: whatsappBotConversationsTable.id,
      status: whatsappBotConversationsTable.status,
      mode: whatsappBotConversationsTable.mode,
      contextSummary: whatsappBotConversationsTable.contextSummary,
      humanPausedAt: whatsappBotConversationsTable.humanPausedAt,
      returnedToBotAt: whatsappBotConversationsTable.returnedToBotAt,
      lastMessageAt: whatsappBotConversationsTable.lastMessageAt,
      metadata: whatsappBotConversationsTable.metadata,
      updatedAt: whatsappBotConversationsTable.updatedAt,
      contactId: whatsappBotContactsTable.id,
      contactDisplayName: whatsappBotContactsTable.displayName,
      contactPhoneNumber: whatsappBotContactsTable.phoneNumber,
      firstContactAt: whatsappBotContactsTable.firstContactAt,
      lastContactAt: whatsappBotContactsTable.lastContactAt,
    })
    .from(whatsappBotConversationsTable)
    .innerJoin(
      whatsappBotContactsTable,
      and(
        eq(
          whatsappBotContactsTable.id,
          whatsappBotConversationsTable.contactId
        ),
        eq(
          whatsappBotContactsTable.storeId,
          whatsappBotConversationsTable.storeId
        )
      )
    )
    .where(
      and(
        eq(whatsappBotConversationsTable.storeId, storeId),
        or(
          eq(whatsappBotConversationsTable.status, 'pending_human'),
          eq(whatsappBotConversationsTable.mode, 'human')
        )
      )
    )
    .orderBy(desc(whatsappBotConversationsTable.lastMessageAt))
    .limit(30)

  return await Promise.all(
    conversations.map(async conversation => {
      const messages = await db
        .select({
          id: whatsappBotMessagesTable.id,
          direction: whatsappBotMessagesTable.direction,
          senderType: whatsappBotMessagesTable.senderType,
          messageType: whatsappBotMessagesTable.messageType,
          body: whatsappBotMessagesTable.body,
          status: whatsappBotMessagesTable.status,
          occurredAt: whatsappBotMessagesTable.occurredAt,
        })
        .from(whatsappBotMessagesTable)
        .where(
          and(
            eq(whatsappBotMessagesTable.storeId, storeId),
            eq(whatsappBotMessagesTable.conversationId, conversation.id)
          )
        )
        .orderBy(desc(whatsappBotMessagesTable.occurredAt))
        .limit(12)

      const handoff = getHumanHandoffMetadata(conversation.metadata)

      return {
        id: conversation.id,
        status: conversation.status,
        mode: conversation.mode,
        contextSummary: conversation.contextSummary,
        humanPausedAt: conversation.humanPausedAt,
        returnedToBotAt: conversation.returnedToBotAt,
        lastMessageAt: conversation.lastMessageAt,
        updatedAt: conversation.updatedAt,
        contact: {
          id: conversation.contactId,
          displayName: conversation.contactDisplayName,
          phoneNumber: conversation.contactPhoneNumber,
          firstContactAt: conversation.firstContactAt,
          lastContactAt: conversation.lastContactAt,
        },
        handoff: {
          reason: handoff.reason ?? null,
          reasonLabel: getWhatsappHumanHandoffReasonLabel(handoff.reason),
          confidence: handoff.confidence ?? null,
          notifiedAt: handoff.notifiedAt ?? null,
          responsible: handoff.responsible
            ? {
                userId: handoff.responsible.userId ?? null,
                name: handoff.responsible.name ?? null,
                email: handoff.responsible.email ?? null,
                phone: handoff.responsible.phone ?? null,
              }
            : null,
        },
        messages: messages.reverse(),
      } satisfies WhatsappHumanHandoffConversation
    })
  )
}

export async function returnWhatsappConversationToBotForStore({
  storeId,
  conversationId,
  returnedByUserId,
}: {
  storeId: number
  conversationId: string
  returnedByUserId: string
}) {
  const now = new Date()
  const [conversation] = await db.transaction(async tx => {
    const [updatedConversation] = await tx
      .update(whatsappBotConversationsTable)
      .set({
        mode: 'automatic',
        status: 'open',
        returnedToBotAt: now,
        contextSummary:
          'Conversa devolvida ao robo. Proximas mensagens voltam ao atendimento automatico.',
        metadata: sql`${whatsappBotConversationsTable.metadata} || ${JSON.stringify(
          {
            returnedToBot: {
              at: now.toISOString(),
              byUserId: returnedByUserId,
              source: 'store_dashboard',
            },
          }
        )}::jsonb`,
        updatedAt: now,
      })
      .where(
        and(
          eq(whatsappBotConversationsTable.id, conversationId),
          eq(whatsappBotConversationsTable.storeId, storeId),
          or(
            eq(whatsappBotConversationsTable.status, 'pending_human'),
            eq(whatsappBotConversationsTable.mode, 'human')
          )
        )
      )
      .returning()

    if (!updatedConversation) return [null]

    await tx.insert(whatsappBotMessagesTable).values({
      storeId,
      conversationId,
      contactId: updatedConversation.contactId,
      numberId: updatedConversation.numberId,
      sessionId: updatedConversation.sessionId,
      providerMessageId: `internal:return-to-bot:${randomUUID()}`,
      direction: 'internal',
      senderType: 'system',
      messageType: 'text',
      body: 'Conversa devolvida ao robo pelo painel da loja.',
      status: 'received',
      occurredAt: now,
      metadata: {
        source: 'store_dashboard',
        action: 'return_to_bot',
        returnedByUserId,
      },
    })

    return [updatedConversation]
  })

  if (!conversation) {
    throw new Error('Conversa nao encontrada ou ja esta em modo automatico.')
  }

  return conversation
}

export async function getWhatsappBotSessionForStore(storeId: number) {
  const [row] = await db
    .select({
      session: whatsappBotSessionsTable,
      number: whatsappBotNumbersTable,
    })
    .from(whatsappBotSessionsTable)
    .innerJoin(
      whatsappBotNumbersTable,
      and(
        eq(whatsappBotNumbersTable.id, whatsappBotSessionsTable.numberId),
        eq(whatsappBotNumbersTable.storeId, whatsappBotSessionsTable.storeId)
      )
    )
    .where(eq(whatsappBotSessionsTable.storeId, storeId))
    .orderBy(desc(whatsappBotSessionsTable.updatedAt))
    .limit(1)

  return row ? toSessionSnapshot(row.session, row.number) : null
}

export async function startWhatsappBotConnection({
  storeId,
  phoneNumber,
  displayName,
  client = createEvolutionClient(),
}: {
  storeId: number
  phoneNumber: string
  displayName?: string | null
  client?: EvolutionClient
}) {
  const now = new Date()
  const [activeSession] = await db
    .select()
    .from(whatsappBotSessionsTable)
    .where(
      and(
        eq(whatsappBotSessionsTable.storeId, storeId),
        inArray(whatsappBotSessionsTable.status, [
          'pending_qr',
          'connecting',
          'connected',
        ])
      )
    )
    .orderBy(desc(whatsappBotSessionsTable.updatedAt))
    .limit(1)

  if (activeSession) {
    return toSessionSnapshot(
      activeSession,
      await getNumberForSession(activeSession)
    )
  }

  const [number] = await db
    .insert(whatsappBotNumbersTable)
    .values({
      storeId,
      phoneNumber,
      displayName: displayName ?? null,
      provider: whatsappBotProvider,
      status: 'inactive',
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        whatsappBotNumbersTable.storeId,
        whatsappBotNumbersTable.phoneNumber,
      ],
      set: {
        displayName: displayName ?? null,
        status: 'inactive',
        updatedAt: now,
      },
    })
    .returning()

  const providerSessionId = buildEvolutionInstanceName({
    storeId,
    numberId: number.id,
  })

  const [existingSession] = await db
    .select()
    .from(whatsappBotSessionsTable)
    .where(
      and(
        eq(whatsappBotSessionsTable.storeId, storeId),
        eq(whatsappBotSessionsTable.numberId, number.id),
        eq(whatsappBotSessionsTable.provider, whatsappBotProvider)
      )
    )
    .orderBy(desc(whatsappBotSessionsTable.updatedAt))
    .limit(1)

  const webhookUrl = buildEvolutionWebhookUrl()
  const webhookSecret = process.env.WHATSAPP_EVOLUTION_WEBHOOK_SECRET
  const evolutionResult = existingSession
    ? await client.connectInstance({
        instanceName: existingSession.providerSessionId,
        token: getSessionToken(existingSession),
      })
    : await client.createInstance({
        instanceName: providerSessionId,
        webhookUrl,
        webhookSecret,
      })

  const qrCodeExpiresAt = evolutionResult.qrCode
    ? resolveQrCodeExpiresAt()
    : null

  if (existingSession) {
    const [session] = await db
      .update(whatsappBotSessionsTable)
      .set({
        status: 'pending_qr',
        qrCodeExpiresAt,
        lastErrorCode: null,
        lastErrorMessage: null,
        metadata: buildSessionMetadata({
          currentMetadata: existingSession.metadata,
          evolutionResult,
          webhookUrl,
          qrCodeExpiresAt,
        }),
        updatedAt: now,
      })
      .where(eq(whatsappBotSessionsTable.id, existingSession.id))
      .returning()

    return toSessionSnapshot(session, number)
  }

  const [session] = await db
    .insert(whatsappBotSessionsTable)
    .values({
      storeId,
      numberId: number.id,
      provider: whatsappBotProvider,
      providerSessionId,
      status: 'pending_qr',
      qrCodeExpiresAt,
      metadata: buildSessionMetadata({
        evolutionResult,
        webhookUrl,
        qrCodeExpiresAt,
      }),
      updatedAt: now,
    })
    .returning()

  return toSessionSnapshot(session, number)
}

export async function renewWhatsappBotQrCode({
  storeId,
  sessionId,
  client = createEvolutionClient(),
}: {
  storeId: number
  sessionId: number
  client?: EvolutionClient
}) {
  const [session] = await db
    .select()
    .from(whatsappBotSessionsTable)
    .where(
      and(
        eq(whatsappBotSessionsTable.id, sessionId),
        eq(whatsappBotSessionsTable.storeId, storeId)
      )
    )
    .limit(1)

  if (!session) throw new Error('WHATSAPP_BOT_SESSION_NOT_FOUND')

  const evolutionResult = await client.connectInstance({
    instanceName: session.providerSessionId,
    token: getSessionToken(session),
  })
  const qrCodeExpiresAt = evolutionResult.qrCode
    ? resolveQrCodeExpiresAt()
    : null

  const [updatedSession] = await db
    .update(whatsappBotSessionsTable)
    .set({
      status: 'pending_qr',
      qrCodeExpiresAt,
      lastErrorCode: null,
      lastErrorMessage: null,
      metadata: buildSessionMetadata({
        currentMetadata: session.metadata,
        evolutionResult,
        qrCodeExpiresAt,
      }),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(whatsappBotSessionsTable.id, session.id),
        eq(whatsappBotSessionsTable.storeId, storeId)
      )
    )
    .returning()

  return toSessionSnapshot(
    updatedSession,
    await getNumberForSession(updatedSession)
  )
}

export async function pauseWhatsappBotSession({
  storeId,
  sessionId,
}: {
  storeId: number
  sessionId: number
}) {
  const [existingSession] = await db
    .select()
    .from(whatsappBotSessionsTable)
    .where(
      and(
        eq(whatsappBotSessionsTable.id, sessionId),
        eq(whatsappBotSessionsTable.storeId, storeId)
      )
    )
    .limit(1)

  if (!existingSession) throw new Error('WHATSAPP_BOT_SESSION_NOT_FOUND')

  const [session] = await db
    .update(whatsappBotSessionsTable)
    .set({
      status: 'paused',
      qrCodeExpiresAt: null,
      metadata: {
        ...toMetadata(existingSession.metadata),
        qrCode: null,
      },
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(whatsappBotSessionsTable.id, sessionId),
        eq(whatsappBotSessionsTable.storeId, storeId)
      )
    )
    .returning()

  return toSessionSnapshot(session, await getNumberForSession(session))
}

export async function disconnectWhatsappBotSession({
  storeId,
  sessionId,
  client = createEvolutionClient(),
}: {
  storeId: number
  sessionId: number
  client?: EvolutionClient
}) {
  const [session] = await db
    .select()
    .from(whatsappBotSessionsTable)
    .where(
      and(
        eq(whatsappBotSessionsTable.id, sessionId),
        eq(whatsappBotSessionsTable.storeId, storeId)
      )
    )
    .limit(1)

  if (!session) throw new Error('WHATSAPP_BOT_SESSION_NOT_FOUND')

  await client.logoutInstance({
    instanceName: session.providerSessionId,
    token: getSessionToken(session),
  })

  const now = new Date()
  await db
    .update(whatsappBotNumbersTable)
    .set({ status: 'disconnected', updatedAt: now })
    .where(
      and(
        eq(whatsappBotNumbersTable.id, session.numberId),
        eq(whatsappBotNumbersTable.storeId, storeId)
      )
    )

  const [updatedSession] = await db
    .update(whatsappBotSessionsTable)
    .set({
      status: 'disconnected',
      qrCodeExpiresAt: null,
      disconnectedAt: now,
      metadata: {
        ...toMetadata(session.metadata),
        qrCode: null,
      },
      updatedAt: now,
    })
    .where(
      and(
        eq(whatsappBotSessionsTable.id, session.id),
        eq(whatsappBotSessionsTable.storeId, storeId)
      )
    )
    .returning()

  return toSessionSnapshot(
    updatedSession,
    await getNumberForSession(updatedSession)
  )
}

export async function processWhatsappInboundMessage({
  instanceName,
  senderPhone,
  displayName,
  body,
  providerMessageId,
  messageType,
  occurredAt = new Date(),
  additionalDataAllowed = false,
  rawPayload,
}: {
  instanceName: string
  senderPhone: string
  displayName?: string | null
  body?: string | null
  providerMessageId?: string | null
  messageType?: WhatsappBotInboundMessageType
  occurredAt?: Date
  additionalDataAllowed?: boolean
  rawPayload?: unknown
}): Promise<WhatsappInboundMessageProcessingResult> {
  const phoneNumber = normalizeWhatsappPhoneNumber(senderPhone)
  if (!phoneNumber) throw new Error('WHATSAPP_BOT_INVALID_CONTACT_PHONE')

  const normalizedMessageType = messageType ?? 'text'
  const now = new Date()
  const normalizedOccurredAt = Number.isNaN(occurredAt.getTime())
    ? now
    : occurredAt
  const normalizedDisplayName = displayName?.trim() || null
  const normalizedBody = body?.trim() || null
  const optOutRequested = detectPromotionalOptOut(normalizedBody)

  return db.transaction(async tx => {
    const conversationMetadataPatch = JSON.stringify({
      lastInboundProviderMessageId: providerMessageId ?? null,
    })

    const [session] = await tx
      .select()
      .from(whatsappBotSessionsTable)
      .where(eq(whatsappBotSessionsTable.providerSessionId, instanceName))
      .limit(1)

    if (!session) throw new Error('WHATSAPP_BOT_SESSION_NOT_FOUND')

    const [existingContact] = await tx
      .select()
      .from(whatsappBotContactsTable)
      .where(
        and(
          eq(whatsappBotContactsTable.storeId, session.storeId),
          eq(whatsappBotContactsTable.phoneNumber, phoneNumber)
        )
      )
      .limit(1)

    const contactMetadata = buildContactIngestionMetadata({
      body: normalizedBody,
      displayName: normalizedDisplayName,
      providerMessageId,
      messageType: normalizedMessageType,
      occurredAt: normalizedOccurredAt,
      additionalDataAllowed,
      isFirstContact: !existingContact,
    })

    const [contact] = await tx
      .insert(whatsappBotContactsTable)
      .values({
        storeId: session.storeId,
        phoneNumber,
        displayName: normalizedDisplayName,
        source: 'whatsapp',
        firstContactAt: normalizedOccurredAt,
        lastContactAt: normalizedOccurredAt,
        promotionalOptOutAt: optOutRequested ? normalizedOccurredAt : null,
        metadata: contactMetadata,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          whatsappBotContactsTable.storeId,
          whatsappBotContactsTable.phoneNumber,
        ],
        set: {
          displayName: normalizedDisplayName
            ? normalizedDisplayName
            : sql`${whatsappBotContactsTable.displayName}`,
          source: 'whatsapp',
          lastContactAt: normalizedOccurredAt,
          promotionalOptOutAt: optOutRequested
            ? normalizedOccurredAt
            : sql`${whatsappBotContactsTable.promotionalOptOutAt}`,
          metadata: sql`${whatsappBotContactsTable.metadata} || excluded.metadata`,
          updatedAt: now,
        },
      })
      .returning()

    const [existingConversation] = await tx
      .select()
      .from(whatsappBotConversationsTable)
      .where(
        and(
          eq(whatsappBotConversationsTable.storeId, session.storeId),
          eq(whatsappBotConversationsTable.contactId, contact.id),
          inArray(whatsappBotConversationsTable.status, [
            'open',
            'pending_human',
          ])
        )
      )
      .orderBy(desc(whatsappBotConversationsTable.lastMessageAt))
      .limit(1)

    const [conversation] = existingConversation
      ? await tx
          .update(whatsappBotConversationsTable)
          .set({
            numberId: session.numberId,
            sessionId: session.id,
            lastMessageAt: normalizedOccurredAt,
            metadata: sql`${whatsappBotConversationsTable.metadata} || ${conversationMetadataPatch}::jsonb`,
            updatedAt: now,
          })
          .where(
            and(
              eq(whatsappBotConversationsTable.id, existingConversation.id),
              eq(whatsappBotConversationsTable.storeId, session.storeId)
            )
          )
          .returning()
      : await tx
          .insert(whatsappBotConversationsTable)
          .values({
            storeId: session.storeId,
            contactId: contact.id,
            numberId: session.numberId,
            sessionId: session.id,
            mode: 'automatic',
            status: 'open',
            lastMessageAt: normalizedOccurredAt,
            metadata: {
              provider: whatsappBotProvider,
              source: 'whatsapp_inbound',
              lastInboundProviderMessageId: providerMessageId ?? null,
            },
            updatedAt: now,
          })
          .returning()

    const [message] = await tx
      .insert(whatsappBotMessagesTable)
      .values({
        storeId: session.storeId,
        conversationId: conversation.id,
        contactId: contact.id,
        numberId: session.numberId,
        sessionId: session.id,
        providerMessageId: providerMessageId ?? null,
        direction: 'inbound',
        senderType: 'customer',
        messageType: normalizedMessageType,
        body: normalizedBody,
        status: 'received',
        occurredAt: normalizedOccurredAt,
        metadata: {
          provider: whatsappBotProvider,
          source: 'whatsapp_inbound',
          rawPayload: redactProviderPayload(rawPayload),
          optOutRequested,
        },
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning()

    return {
      contact,
      conversation,
      message: message ?? null,
      messageCreated: Boolean(message),
    }
  })
}

async function getWhatsappAssistantBusinessContext(storeId: number) {
  const [store] = await db
    .select({
      id: storesTable.id,
      name: storesTable.name,
      subdomain: storesTable.subdomain,
    })
    .from(storesTable)
    .where(eq(storesTable.id, storeId))
    .limit(1)

  if (!store) throw new Error('STORE_NOT_FOUND')

  const [digitalMenu, businessHours, paymentMethods, menuRows] =
    await Promise.all([
      db
        .select()
        .from(storeDigitalMenuSettingsTable)
        .where(eq(storeDigitalMenuSettingsTable.storeId, storeId))
        .limit(1),
      db
        .select({
          weekday: storeBusinessHoursTable.weekday,
          opensAt: storeBusinessHoursTable.opensAt,
          closesAt: storeBusinessHoursTable.closesAt,
          serviceType: storeBusinessHoursTable.serviceType,
          isActive: storeBusinessHoursTable.isActive,
        })
        .from(storeBusinessHoursTable)
        .where(eq(storeBusinessHoursTable.storeId, storeId))
        .orderBy(
          asc(storeBusinessHoursTable.weekday),
          asc(storeBusinessHoursTable.opensAt)
        )
        .limit(21),
      db
        .select({
          method: storePaymentMethodsTable.method,
          cardBrand: storePaymentMethodsTable.cardBrand,
          instructions: storePaymentMethodsTable.instructions,
          proofInstructions: storePaymentMethodsTable.proofInstructions,
          pixKey: storePaymentMethodsTable.pixKey,
          allowDelivery: storePaymentMethodsTable.allowDelivery,
          allowTakeout: storePaymentMethodsTable.allowTakeout,
        })
        .from(storePaymentMethodsTable)
        .where(
          and(
            eq(storePaymentMethodsTable.storeId, storeId),
            eq(storePaymentMethodsTable.isActive, true)
          )
        )
        .orderBy(asc(storePaymentMethodsTable.method))
        .limit(12),
      db
        .select({
          itemOfferingId: itemOfferingsTable.id,
          itemId: itemsTable.id,
          name: itemsTable.name,
          categoryName: categoriesTable.name,
          description: itemsTable.description,
          price: itemOfferingsTable.price,
          originalPrice: itemOfferingsTable.originalPrice,
          isAvailable: itemOfferingsTable.isAvailable,
          categoryIsAvailable: categoriesTable.isAvailable,
          inventory: itemsTable.inventory,
          externalCode: itemOfferingsTable.externalCode,
        })
        .from(itemOfferingsTable)
        .innerJoin(itemsTable, eq(itemsTable.id, itemOfferingsTable.itemId))
        .innerJoin(
          categoriesTable,
          eq(categoriesTable.id, itemOfferingsTable.categoryId)
        )
        .where(
          and(
            eq(itemsTable.storeId, storeId),
            eq(categoriesTable.storeId, storeId)
          )
        )
        .orderBy(asc(categoriesTable.index), asc(itemOfferingsTable.index))
        .limit(80),
    ])

  const optionGroupsByOffering = menuRows.length
    ? await getOptionGroupsByItemOfferingIds({
        itemOfferingIds: menuRows.map(item => item.itemOfferingId),
        storeId,
      })
    : {}

  const allProducts: WhatsappAssistantStoreToolProduct[] = menuRows.map(
    item => {
      const availability = resolveWhatsappAssistantProductAvailability({
        categoryIsAvailable: item.categoryIsAvailable,
        offeringIsAvailable: item.isAvailable,
        inventory: item.inventory,
      })

      return {
        itemOfferingId: item.itemOfferingId,
        itemId: item.itemId,
        categoryName: item.categoryName,
        name: item.name,
        description: item.description,
        price: item.price,
        originalPrice: item.originalPrice,
        inventory: item.inventory,
        externalCode: item.externalCode,
        optionGroups: (optionGroupsByOffering[item.itemOfferingId] ?? [])
          .filter(group => group.storeId === storeId)
          .map(group => ({
            id: group.id,
            name: group.name,
            minQuantity: group.minQuantity,
            maxQuantity: group.maxQuantity,
            options: group.options.map(option => ({
              id: option.id,
              name: option.item.name,
              price: option.price,
              minQuantity: option.minQuantity,
              maxQuantity: option.maxQuantity,
            })),
          })),
        ...availability,
      }
    }
  )

  const availableProducts = allProducts.filter(
    item => item.availabilityStatus === 'available'
  )
  const unavailableProducts = allProducts
    .filter(item => item.availabilityStatus === 'unavailable')
    .slice(0, 20)
  const activePayments = paymentMethods.filter(
    method => method.allowDelivery || method.allowTakeout
  )
  const modalities = resolveWhatsappAssistantModalities({
    digitalMenu: digitalMenu[0] ?? null,
    paymentMethods: activePayments,
  })

  return {
    storeName: store.name,
    digitalMenu: digitalMenu[0] ?? null,
    businessHours,
    paymentMethods: activePayments,
    menuItems: availableProducts.slice(0, 20).map(item => ({
      name: item.name,
      categoryName: item.categoryName,
      description: item.description,
      price: item.price,
      isAvailable: true,
    })),
    storeTools: {
      scope: 'conversation_store' as const,
      store: {
        name: store.name,
        subdomain: store.subdomain,
        digitalMenuUrl: `${getPublicAppBaseUrl()}/cardapio/${encodeURIComponent(store.subdomain)}`,
      },
      menu: {
        status: allProducts.length ? ('known' as const) : ('missing' as const),
        products: availableProducts,
        unavailableProducts,
        emptyReason: allProducts.length
          ? null
          : 'Nenhum produto foi encontrado para esta loja.',
      },
      operations: {
        digitalMenu: digitalMenu[0] ?? null,
        businessHours,
        modalities,
      },
      payments: activePayments,
    },
  }
}

async function sendQueuedWhatsappAssistantMessage({
  messageId,
  storeId,
  instanceName,
  token,
  recipientPhoneNumber,
  text,
  evolutionClient,
}: {
  messageId: string
  storeId: number
  instanceName: string
  token: string | null
  recipientPhoneNumber: string
  text: string
  evolutionClient?: EvolutionClient
}): Promise<WhatsappAssistantOrchestrationResult['deliveryStatus']> {
  const startedAt = Date.now()

  try {
    const client = evolutionClient ?? createEvolutionClient()
    const delivery = await client.sendTextMessage({
      instanceName,
      token,
      number: recipientPhoneNumber,
      text,
    })

    await db
      .update(whatsappBotMessagesTable)
      .set({
        status: 'sent',
        metadata: sql`${whatsappBotMessagesTable.metadata} || ${JSON.stringify({
          delivery: {
            provider: whatsappBotProvider,
            providerMessageId: delivery.providerMessageId,
            status: delivery.status,
            latencyMs: Date.now() - startedAt,
          },
        })}::jsonb`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(whatsappBotMessagesTable.id, messageId),
          eq(whatsappBotMessagesTable.storeId, storeId)
        )
      )

    return 'sent'
  } catch (error) {
    await db
      .update(whatsappBotMessagesTable)
      .set({
        status: 'failed',
        metadata: sql`${whatsappBotMessagesTable.metadata} || ${JSON.stringify({
          delivery: {
            provider: whatsappBotProvider,
            status: 'failed',
            latencyMs: Date.now() - startedAt,
            failure: {
              name: error instanceof Error ? error.name : 'UnknownError',
              message:
                error instanceof Error
                  ? error.message
                  : 'Failed to send WhatsApp assistant message.',
            },
          },
        })}::jsonb`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(whatsappBotMessagesTable.id, messageId),
          eq(whatsappBotMessagesTable.storeId, storeId)
        )
      )

    return 'failed'
  }
}

export async function runWhatsappAssistantOrchestrator({
  storeId,
  conversationId,
  inboundMessageId,
  provider,
  evolutionClient,
}: {
  storeId: number
  conversationId: string
  inboundMessageId: string
  provider?: WhatsappAssistantLlmProvider
  evolutionClient?: EvolutionClient
}): Promise<WhatsappAssistantOrchestrationResult> {
  const [row] = await db
    .select({
      conversation: whatsappBotConversationsTable,
      contact: whatsappBotContactsTable,
      inboundMessage: whatsappBotMessagesTable,
      assistantConfig: whatsappBotAssistantConfigsTable,
      session: whatsappBotSessionsTable,
    })
    .from(whatsappBotConversationsTable)
    .innerJoin(
      whatsappBotContactsTable,
      and(
        eq(
          whatsappBotContactsTable.id,
          whatsappBotConversationsTable.contactId
        ),
        eq(
          whatsappBotContactsTable.storeId,
          whatsappBotConversationsTable.storeId
        )
      )
    )
    .innerJoin(
      whatsappBotMessagesTable,
      and(
        eq(whatsappBotMessagesTable.id, inboundMessageId),
        eq(
          whatsappBotMessagesTable.storeId,
          whatsappBotConversationsTable.storeId
        ),
        eq(
          whatsappBotMessagesTable.conversationId,
          whatsappBotConversationsTable.id
        )
      )
    )
    .innerJoin(
      whatsappBotAssistantConfigsTable,
      eq(
        whatsappBotAssistantConfigsTable.storeId,
        whatsappBotConversationsTable.storeId
      )
    )
    .innerJoin(
      whatsappBotSessionsTable,
      and(
        eq(
          whatsappBotSessionsTable.id,
          whatsappBotConversationsTable.sessionId
        ),
        eq(
          whatsappBotSessionsTable.storeId,
          whatsappBotConversationsTable.storeId
        )
      )
    )
    .where(
      and(
        eq(whatsappBotConversationsTable.id, conversationId),
        eq(whatsappBotConversationsTable.storeId, storeId)
      )
    )
    .limit(1)

  if (!row) throw new Error('WHATSAPP_ASSISTANT_CONTEXT_NOT_FOUND')

  const currentMessage = row.inboundMessage.body?.trim() ?? ''
  const intent = classifyWhatsappAssistantIntent(currentMessage)
  const assistantProviderMessageId = `assistant:${inboundMessageId}`

  const [existingAssistantReply] = await db
    .select({
      id: whatsappBotMessagesTable.id,
      status: whatsappBotMessagesTable.status,
    })
    .from(whatsappBotMessagesTable)
    .where(
      and(
        eq(whatsappBotMessagesTable.storeId, storeId),
        eq(
          whatsappBotMessagesTable.providerMessageId,
          assistantProviderMessageId
        )
      )
    )
    .limit(1)

  if (existingAssistantReply) {
    return {
      action: 'skipped',
      reason: 'assistant_reply_already_created',
      intent,
      outboundMessageId: existingAssistantReply.id,
      latencyMs: null,
      deliveryStatus:
        existingAssistantReply.status === 'sent' ? 'sent' : 'not_sent',
    }
  }

  const eligibility = canWhatsappAssistantRespond({
    conversation: row.conversation,
    inboundMessage: row.inboundMessage,
    assistantConfig: row.assistantConfig,
  })

  if (!eligibility.allowed) {
    return {
      action: 'skipped',
      reason: eligibility.reason,
      intent,
      outboundMessageId: null,
      latencyMs: null,
      deliveryStatus: 'not_sent',
    }
  }

  const recentMessages = await db
    .select({
      direction: whatsappBotMessagesTable.direction,
      senderType: whatsappBotMessagesTable.senderType,
      messageType: whatsappBotMessagesTable.messageType,
      body: whatsappBotMessagesTable.body,
      metadata: whatsappBotMessagesTable.metadata,
      occurredAt: whatsappBotMessagesTable.occurredAt,
    })
    .from(whatsappBotMessagesTable)
    .where(
      and(
        eq(whatsappBotMessagesTable.storeId, storeId),
        eq(whatsappBotMessagesTable.conversationId, conversationId)
      )
    )
    .orderBy(desc(whatsappBotMessagesTable.occurredAt))
    .limit(20)

  const history = trimWhatsappAssistantHistory({
    messages: [...recentMessages].reverse(),
  })
  const businessContext = await getWhatsappAssistantBusinessContext(storeId)
  const handoffDecision = detectWhatsappHumanHandoff({
    intent,
    message: currentMessage,
    history: recentMessages,
  })

  if (handoffDecision.shouldHandoff && handoffDecision.reason) {
    const handoffReason = handoffDecision.reason
    const now = new Date()
    const responsible = await getWhatsappHumanHandoffResponsible(storeId)
    const handoffMetadata = {
      reason: handoffReason,
      reasonLabel: getWhatsappHumanHandoffReasonLabel(handoffReason),
      confidence: handoffDecision.confidence,
      notifiedAt: now.toISOString(),
      notificationChannel: 'internal_queue',
      responsible,
    }
    const ctaDecision = decideWhatsappDigitalMenuCta({
      intent,
      conversationId,
      messageId: assistantProviderMessageId,
      digitalMenuUrl: businessContext.storeTools?.store.digitalMenuUrl,
      tone: row.assistantConfig.tone,
      history: recentMessages,
    })
    const reply = ctaDecision.text
      ? appendWhatsappDigitalMenuCta({
          reply: buildWhatsappHumanHandoffReply(row.assistantConfig),
          ctaText: ctaDecision.text,
        })
      : buildWhatsappHumanHandoffReply(row.assistantConfig)
    const [message] = await db.transaction(async tx => {
      const [createdMessage] = await tx
        .insert(whatsappBotMessagesTable)
        .values({
          storeId,
          conversationId,
          contactId: row.contact.id,
          numberId: row.conversation.numberId,
          sessionId: row.conversation.sessionId,
          providerMessageId: assistantProviderMessageId,
          direction: 'outbound',
          senderType: 'bot',
          messageType: 'text',
          body: reply,
          status: 'queued',
          occurredAt: new Date(),
          metadata: {
            provider: 'internal',
            source: 'whatsapp_assistant_orchestrator',
            intent,
            fallback: true,
            fallbackReason: handoffReason,
            humanHandoff: handoffMetadata,
            digitalMenuCta: {
              sent: ctaDecision.shouldSend,
              reason: ctaDecision.reason,
              url: ctaDecision.url,
              attribution: ctaDecision.attribution,
            },
          },
        })
        .onConflictDoNothing()
        .returning()

      await tx
        .update(whatsappBotConversationsTable)
        .set({
          status: 'pending_human',
          mode: 'human',
          humanPausedAt: now,
          contextSummary: buildWhatsappHumanHandoffContextSummary({
            reason: handoffReason,
            intent,
            currentMessage,
          }),
          metadata: sql`${whatsappBotConversationsTable.metadata} || ${JSON.stringify({ humanHandoff: handoffMetadata })}::jsonb`,
          updatedAt: now,
        })
        .where(
          and(
            eq(whatsappBotConversationsTable.id, conversationId),
            eq(whatsappBotConversationsTable.storeId, storeId)
          )
        )

      await tx.insert(whatsappBotMessagesTable).values({
        storeId,
        conversationId,
        contactId: row.contact.id,
        numberId: row.conversation.numberId,
        sessionId: row.conversation.sessionId,
        providerMessageId: `internal:handoff:${inboundMessageId}`,
        direction: 'internal',
        senderType: 'system',
        messageType: 'text',
        body: buildWhatsappHumanHandoffInternalNote({
          reason: handoffReason,
          contactName: row.contact.displayName,
          currentMessage,
        }),
        status: 'received',
        occurredAt: now,
        metadata: {
          source: 'whatsapp_human_handoff',
          notification: handoffMetadata,
        },
      })

      return [createdMessage]
    })

    if (!message) {
      return {
        action: 'skipped',
        reason: 'assistant_reply_already_created',
        intent,
        outboundMessageId: null,
        latencyMs: 0,
        deliveryStatus: 'not_sent',
      }
    }

    const deliveryStatus = await sendQueuedWhatsappAssistantMessage({
      messageId: message.id,
      storeId,
      instanceName: row.session.providerSessionId,
      token: getSessionToken(row.session),
      recipientPhoneNumber: row.contact.phoneNumber,
      text: reply,
      evolutionClient,
    })

    return {
      action: 'handoff',
      reason: handoffReason,
      intent,
      outboundMessageId: message.id,
      latencyMs: 0,
      deliveryStatus,
    }
  }

  const systemPrompt = buildWhatsappAssistantSystemPrompt({
    assistantConfig: row.assistantConfig,
    contact: row.contact,
    conversation: row.conversation,
    businessContext,
    intent,
  })
  const userPrompt = buildWhatsappAssistantUserPrompt({
    history,
    currentMessage,
  })
  const estimatedInputTokens = estimateWhatsappAssistantTokens(
    `${systemPrompt}\n\n${userPrompt}`
  )
  const startedAt = Date.now()

  let action: WhatsappAssistantOrchestrationResult['action'] = 'responded'
  let reason: string | null = null
  let reply = ''
  let llmMetadata: Record<string, unknown>
  let resolvedProvider = provider
  let fallbackHandoffDecision: WhatsappHumanHandoffDecision | null = null

  try {
    resolvedProvider ??= createOpenAiCompatibleWhatsappLlmProvider()
    const llmResponse = await resolvedProvider.generateReply({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      tools: businessContext.storeTools
        ? createWhatsappAssistantStoreTools(businessContext.storeTools)
        : undefined,
      timeoutMs: 12_000,
    })

    reply = llmResponse.text
    const ctaDecision = decideWhatsappDigitalMenuCta({
      intent,
      conversationId,
      messageId: assistantProviderMessageId,
      digitalMenuUrl: businessContext.storeTools?.store.digitalMenuUrl,
      tone: row.assistantConfig.tone,
      history: recentMessages,
    })
    if (ctaDecision.text) {
      reply = appendWhatsappDigitalMenuCta({
        reply,
        ctaText: ctaDecision.text,
      })
    }

    llmMetadata = {
      provider: llmResponse.provider,
      model: llmResponse.model,
      usage: llmResponse.usage,
      latencyMs: llmResponse.latencyMs,
      finishReason: llmResponse.finishReason,
      toolCalls: llmResponse.toolCalls,
      digitalMenuCta: {
        sent: ctaDecision.shouldSend,
        reason: ctaDecision.reason,
        url: ctaDecision.url,
        attribution: ctaDecision.attribution,
      },
      estimatedInputTokens,
    }
  } catch (error) {
    reason = error instanceof Error ? error.message : 'provider_failed'
    fallbackHandoffDecision = detectWhatsappHumanHandoff({
      intent,
      message: currentMessage,
      history: recentMessages,
      providerFailed: true,
    })
    action =
      fallbackHandoffDecision.shouldHandoff && fallbackHandoffDecision.reason
        ? 'handoff'
        : 'fallback'
    reply =
      fallbackHandoffDecision.shouldHandoff && fallbackHandoffDecision.reason
        ? buildWhatsappHumanHandoffReply(row.assistantConfig)
        : row.assistantConfig.fallbackMessage
    const ctaDecision = decideWhatsappDigitalMenuCta({
      intent,
      conversationId,
      messageId: assistantProviderMessageId,
      digitalMenuUrl: businessContext.storeTools?.store.digitalMenuUrl,
      tone: row.assistantConfig.tone,
      history: recentMessages,
    })
    if (ctaDecision.text) {
      reply = appendWhatsappDigitalMenuCta({
        reply,
        ctaText: ctaDecision.text,
      })
    }
    llmMetadata = {
      provider: resolvedProvider?.name ?? 'unconfigured',
      model: resolvedProvider?.model ?? 'unconfigured',
      usage: null,
      latencyMs: Date.now() - startedAt,
      humanHandoff:
        fallbackHandoffDecision.shouldHandoff && fallbackHandoffDecision.reason
          ? {
              reason: fallbackHandoffDecision.reason,
              reasonLabel: getWhatsappHumanHandoffReasonLabel(
                fallbackHandoffDecision.reason
              ),
              confidence: fallbackHandoffDecision.confidence,
            }
          : null,
      failure: {
        name: error instanceof Error ? error.name : 'UnknownError',
        message: reason,
      },
      digitalMenuCta: {
        sent: ctaDecision.shouldSend,
        reason: ctaDecision.reason,
        url: ctaDecision.url,
        attribution: ctaDecision.attribution,
      },
      estimatedInputTokens,
    }
  }

  const [outboundMessage] = await db
    .insert(whatsappBotMessagesTable)
    .values({
      storeId,
      conversationId,
      contactId: row.contact.id,
      numberId: row.conversation.numberId,
      sessionId: row.conversation.sessionId,
      providerMessageId: assistantProviderMessageId,
      direction: 'outbound',
      senderType: 'bot',
      messageType: 'text',
      body: reply,
      status: 'queued',
      occurredAt: new Date(),
      metadata: {
        source: 'whatsapp_assistant_orchestrator',
        intent,
        fallback: action === 'fallback',
        ...llmMetadata,
      },
    })
    .onConflictDoNothing()
    .returning()

  if (!outboundMessage) {
    return {
      action: 'skipped',
      reason: 'assistant_reply_already_created',
      intent,
      outboundMessageId: null,
      latencyMs:
        typeof llmMetadata.latencyMs === 'number'
          ? llmMetadata.latencyMs
          : null,
      deliveryStatus: 'not_sent',
    }
  }

  const deliveryStatus = await sendQueuedWhatsappAssistantMessage({
    messageId: outboundMessage.id,
    storeId,
    instanceName: row.session.providerSessionId,
    token: getSessionToken(row.session),
    recipientPhoneNumber: row.contact.phoneNumber,
    text: reply,
    evolutionClient,
  })

  if (
    fallbackHandoffDecision?.shouldHandoff &&
    fallbackHandoffDecision.reason
  ) {
    const now = new Date()
    const responsible = await getWhatsappHumanHandoffResponsible(storeId)
    const handoffMetadata = {
      reason: fallbackHandoffDecision.reason,
      reasonLabel: getWhatsappHumanHandoffReasonLabel(
        fallbackHandoffDecision.reason
      ),
      confidence: fallbackHandoffDecision.confidence,
      notifiedAt: now.toISOString(),
      notificationChannel: 'internal_queue',
      responsible,
    }

    await db.transaction(async tx => {
      await tx
        .update(whatsappBotConversationsTable)
        .set({
          status: 'pending_human',
          mode: 'human',
          humanPausedAt: now,
          contextSummary: buildWhatsappHumanHandoffContextSummary({
            reason: fallbackHandoffDecision.reason!,
            intent,
            currentMessage,
          }),
          metadata: sql`${whatsappBotConversationsTable.metadata} || ${JSON.stringify({ humanHandoff: handoffMetadata })}::jsonb`,
          updatedAt: now,
        })
        .where(
          and(
            eq(whatsappBotConversationsTable.id, conversationId),
            eq(whatsappBotConversationsTable.storeId, storeId)
          )
        )

      await tx.insert(whatsappBotMessagesTable).values({
        storeId,
        conversationId,
        contactId: row.contact.id,
        numberId: row.conversation.numberId,
        sessionId: row.conversation.sessionId,
        providerMessageId: `internal:handoff:${inboundMessageId}`,
        direction: 'internal',
        senderType: 'system',
        messageType: 'text',
        body: buildWhatsappHumanHandoffInternalNote({
          reason: fallbackHandoffDecision.reason!,
          contactName: row.contact.displayName,
          currentMessage,
        }),
        status: 'received',
        occurredAt: now,
        metadata: {
          source: 'whatsapp_human_handoff',
          notification: handoffMetadata,
        },
      })
    })

    return {
      action,
      reason: fallbackHandoffDecision.reason,
      intent,
      outboundMessageId: outboundMessage.id,
      latencyMs:
        typeof llmMetadata.latencyMs === 'number'
          ? llmMetadata.latencyMs
          : null,
      deliveryStatus,
    }
  }

  await db
    .update(whatsappBotConversationsTable)
    .set({
      contextSummary: `Ultima intencao: ${intent}. Ultima resposta automatica ${action === 'fallback' ? 'usou fallback' : 'gerada com sucesso'}.`,
      lastMessageAt: outboundMessage.occurredAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(whatsappBotConversationsTable.id, conversationId),
        eq(whatsappBotConversationsTable.storeId, storeId)
      )
    )

  return {
    action,
    reason,
    intent,
    outboundMessageId: outboundMessage.id,
    latencyMs:
      typeof llmMetadata.latencyMs === 'number' ? llmMetadata.latencyMs : null,
    deliveryStatus,
  }
}

export async function applyEvolutionSessionEvent({
  instanceName,
  state,
  reason,
  qrCode,
  rawPayload,
  client,
}: {
  instanceName: string
  state: string | null | undefined
  reason?: unknown
  qrCode?: EvolutionQrCode | null
  rawPayload?: unknown
  client?: EvolutionClient
}) {
  const [session] = await db
    .select()
    .from(whatsappBotSessionsTable)
    .where(eq(whatsappBotSessionsTable.providerSessionId, instanceName))
    .limit(1)

  if (!session) throw new Error('WHATSAPP_BOT_SESSION_NOT_FOUND')

  const now = new Date()
  const decision = normalizeEvolutionConnectionDecision({
    state,
    reason,
    hasQrCode: Boolean(qrCode),
  })
  const qrCodeExpiresAt = qrCode ? resolveQrCodeExpiresAt({ now }) : null
  const currentMetadata = toMetadata(session.metadata)

  if (
    !shouldApplyEvolutionSessionEvent({
      currentStatus: session.status,
      hasQrCode: Boolean(qrCode),
      nextStatus: decision.status,
    })
  ) {
    return toSessionSnapshot(session, await getNumberForSession(session))
  }

  const nextMetadata: SessionMetadata = {
    ...currentMetadata,
    provider: whatsappBotProvider,
    lastProviderState: state ?? null,
    lastProviderPayload: redactProviderPayload(rawPayload),
    reconnectRequestedAt:
      decision.action === 'schedule_reconnect'
        ? now.toISOString()
        : currentMetadata.reconnectRequestedAt,
    qrCode:
      decision.status === 'pending_qr' && qrCode
        ? {
            base64: qrCode.base64,
            count: qrCode.count,
            expiresAt: (
              qrCodeExpiresAt ?? resolveQrCodeExpiresAt({ now })
            ).toISOString(),
          }
        : null,
  }

  if (decision.action === 'schedule_reconnect') {
    const lastReconnectAttemptAt =
      typeof currentMetadata.lastReconnectAttemptAt === 'string'
        ? new Date(currentMetadata.lastReconnectAttemptAt)
        : null
    const reconnectPlan = resolveReconnectPlan({
      now,
      lastAttemptAt: lastReconnectAttemptAt,
      attemptCount:
        typeof currentMetadata.reconnectAttemptCount === 'number'
          ? currentMetadata.reconnectAttemptCount
          : 0,
    })

    if (reconnectPlan.shouldAttempt) {
      nextMetadata.reconnectAttemptCount = reconnectPlan.nextAttemptCount
      nextMetadata.lastReconnectAttemptAt = now.toISOString()

      await db
        .update(whatsappBotSessionsTable)
        .set({
          metadata: nextMetadata,
          updatedAt: now,
        })
        .where(
          and(
            eq(whatsappBotSessionsTable.id, session.id),
            eq(whatsappBotSessionsTable.storeId, session.storeId)
          )
        )

      const evolutionClient = client ?? createEvolutionClient()
      await evolutionClient.restartInstance({
        instanceName: session.providerSessionId,
        token: getSessionToken(session),
      })
    } else {
      nextMetadata.reconnectSkippedReason = reconnectPlan.reason
    }
  }

  if (decision.action === 'request_new_qr') {
    const evolutionClient = client ?? createEvolutionClient()
    const evolutionResult = await evolutionClient.connectInstance({
      instanceName: session.providerSessionId,
      token: getSessionToken(session),
    })
    const nextQrExpiresAt = evolutionResult.qrCode
      ? resolveQrCodeExpiresAt({ now })
      : qrCodeExpiresAt

    nextMetadata.qrCode = evolutionResult.qrCode
      ? {
          base64: evolutionResult.qrCode.base64,
          count: evolutionResult.qrCode.count,
          expiresAt: (
            nextQrExpiresAt ?? resolveQrCodeExpiresAt({ now })
          ).toISOString(),
        }
      : nextMetadata.qrCode
  }

  await db
    .update(whatsappBotNumbersTable)
    .set({
      status: decision.numberStatus,
      updatedAt: now,
    })
    .where(
      and(
        eq(whatsappBotNumbersTable.id, session.numberId),
        eq(whatsappBotNumbersTable.storeId, session.storeId)
      )
    )

  const [updatedSession] = await db
    .update(whatsappBotSessionsTable)
    .set({
      status: decision.status,
      qrCodeExpiresAt:
        nextMetadata.qrCode && typeof nextMetadata.qrCode === 'object'
          ? new Date(nextMetadata.qrCode.expiresAt)
          : qrCodeExpiresAt,
      connectedAt: decision.status === 'connected' ? now : session.connectedAt,
      disconnectedAt:
        decision.status === 'disconnected' || decision.status === 'pending_qr'
          ? now
          : session.disconnectedAt,
      lastHeartbeatAt:
        decision.status === 'connected' ? now : session.lastHeartbeatAt,
      lastErrorCode: decision.errorCode,
      lastErrorMessage: decision.errorMessage,
      metadata: nextMetadata,
      updatedAt: now,
    })
    .where(
      and(
        eq(whatsappBotSessionsTable.id, session.id),
        eq(whatsappBotSessionsTable.storeId, session.storeId)
      )
    )
    .returning()

  return toSessionSnapshot(
    updatedSession,
    await getNumberForSession(updatedSession)
  )
}
