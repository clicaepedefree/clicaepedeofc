import 'server-only'

import { db } from '@/services/db'
import { digitalMenuAttributionAccessesTable as accesses } from '@/services/db/schema/digital-menu-attribution-accesses'
import { storesTable as stores } from '@/services/db/schema/stores'
import { whatsappBotConversationsTable as conversations } from '@/services/db/schema/whatsapp-bot-conversations'
import { whatsappBotMessagesTable as messages } from '@/services/db/schema/whatsapp-bot-messages'
import { ordersTable } from '@/services/db/schema/orders'
import { publicOrderSubmissionsTable } from '@/services/db/schema/public-order-submissions'
import { getPublicAppBaseUrl } from '@/shared/lib/domain-config'
import { and, eq, gte, inArray, isNull, sql, type SQL } from 'drizzle-orm'
import {
  normalizeDigitalMenuAttribution,
  type DigitalMenuAttribution,
  type DigitalMenuAttributionInput,
} from './attribution'
import {
  ensureValidReportRange,
  isSupportedReportTimeZone,
} from '@/features/reports/form-validation/report-period'

type Database = Pick<
  typeof db,
  'select' | 'insert' | 'update' | 'execute' | 'transaction'
>
type ReadDatabase = Pick<Database, 'select'>
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const messagePattern =
  /^assistant:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const retainedSince = sql`CURRENT_TIMESTAMP - interval '30 days'`

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const accessContext = (
  storeId: number,
  attribution: DigitalMenuAttribution,
  visitId: string
) =>
  and(
    eq(accesses.id, visitId),
    eq(accesses.storeId, storeId),
    eq(accesses.conversationId, attribution.conversationId),
    eq(accesses.messageId, attribution.messageId!),
    gte(accesses.createdAt, retainedSince)
  )

const readAccess = async (
  database: ReadDatabase,
  storeId: number,
  attribution: DigitalMenuAttribution,
  visitId: string
) => {
  const [row] = await database
    .select({ id: accesses.id })
    .from(accesses)
    .where(accessContext(storeId, attribution, visitId))
    .limit(1)
  return row?.id ?? null
}

/** Attribution is evidence of a sent CTA, never customer authentication. */
export const validateDigitalMenuAttribution = async (
  storeId: number,
  input?: DigitalMenuAttributionInput | null,
  database: ReadDatabase = db
): Promise<DigitalMenuAttribution | null> => {
  const attribution = normalizeDigitalMenuAttribution(input)
  if (
    !Number.isSafeInteger(storeId) ||
    storeId <= 0 ||
    !attribution?.messageId ||
    !messagePattern.test(attribution.messageId) ||
    input?.messageId?.trim() !== attribution.messageId
  )
    return null
  attribution.conversationId = attribution.conversationId.toLowerCase()

  const [row] = await database
    .select({ metadata: messages.metadata, subdomain: stores.subdomain })
    .from(messages)
    .innerJoin(
      conversations,
      and(
        eq(conversations.id, messages.conversationId),
        eq(conversations.storeId, messages.storeId)
      )
    )
    .innerJoin(stores, eq(stores.id, messages.storeId))
    .where(
      and(
        eq(messages.storeId, storeId),
        eq(messages.conversationId, attribution.conversationId),
        eq(messages.providerMessageId, attribution.messageId),
        eq(messages.direction, 'outbound'),
        eq(messages.senderType, 'bot'),
        inArray(messages.status, ['sent', 'delivered', 'read'])
      )
    )
    .limit(1)
  if (!row) return null
  const cta = object(object(row.metadata).digitalMenuCta)
  if (cta.sent !== true || typeof cta.url !== 'string') return null
  try {
    const destination = new URL(cta.url)
    const expected = new URL(
      `${getPublicAppBaseUrl()}/cardapio/${encodeURIComponent(row.subdomain)}`
    )
    if (
      !['https:', 'http:'].includes(destination.protocol) ||
      destination.username ||
      destination.password ||
      destination.origin !== expected.origin ||
      destination.pathname !== expected.pathname ||
      destination.hash
    )
      return null
    const params = {
      utm_source: attribution.source,
      utm_medium: attribution.medium,
      utm_campaign: attribution.campaign,
      wa_conversation: attribution.conversationId,
      wa_message: attribution.messageId,
    }
    for (const [key, value] of Object.entries(params)) {
      const values = destination.searchParams.getAll(key)
      if (
        values.length !== 1 ||
        (key === 'wa_conversation' ? values[0].toLowerCase() : values[0]) !==
          value
      )
        return null
    }
  } catch {
    return null
  }

  if (
    attribution.visitId &&
    !(await readAccess(database, storeId, attribution, attribution.visitId))
  )
    return null
  // Do not return user-provided entryUrl, or any URL query/fragment.
  const { entryUrl: _entryUrl, ...safeAttribution } = attribution
  return safeAttribution
}

/** The server action checks consent; issued CTA authority is checked here too. */
export const recordDigitalMenuAttributionAccess = async (
  {
    storeId,
    attribution,
    visitId,
    stage,
  }: {
    storeId: number
    attribution: DigitalMenuAttribution
    visitId: string
    stage: 'access' | 'cart'
  },
  database: Database = db
): Promise<string | null> => {
  if (
    !Number.isSafeInteger(storeId) ||
    storeId <= 0 ||
    typeof visitId !== 'string' ||
    !uuidPattern.test(visitId) ||
    !attribution ||
    !uuidPattern.test(attribution.conversationId) ||
    !messagePattern.test(attribution.messageId ?? '') ||
    attribution.source !== 'whatsapp_bot' ||
    attribution.medium !== 'assistant' ||
    attribution.campaign !== 'digital_menu_cta' ||
    !['access', 'cart'].includes(stage)
  )
    return null
  visitId = visitId.toLowerCase()
  attribution = {
    ...attribution,
    conversationId: attribution.conversationId.toLowerCase(),
  }
  if (attribution.visitId && attribution.visitId.toLowerCase() !== visitId)
    return null
  const valid = await validateDigitalMenuAttribution(
    storeId,
    {
      ...attribution,
      visitId: undefined,
    },
    database
  )
  if (!valid) return null
  attribution = valid
  if (stage === 'cart') {
    await database
      .update(accesses)
      .set({ cartAt: sql`CURRENT_TIMESTAMP` })
      .where(
        and(
          accessContext(storeId, attribution, visitId),
          isNull(accesses.cartAt)
        )
      )
    return readAccess(database, storeId, attribution, visitId)
  }
  return database.transaction(async tx => {
    // All writers for this CTA serialize quota inspection and insertion.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`digital-menu-cta:${storeId}:${attribution.messageId}`}, 0))`
    )
    const existing = await readAccess(tx, storeId, attribution, visitId)
    if (existing) return existing
    const [quota] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(accesses)
      .where(
        and(
          eq(accesses.storeId, storeId),
          eq(accesses.messageId, attribution.messageId!),
          gte(accesses.createdAt, sql`CURRENT_TIMESTAMP - interval '24 hours'`)
        )
      )
    if (Number(quota?.count ?? 0) >= 100) return null
    await tx
      .insert(accesses)
      .values({
        id: visitId,
        storeId,
        conversationId: attribution.conversationId,
        messageId: attribution.messageId!,
      })
      .onConflictDoNothing({ target: accesses.id })
    return readAccess(tx, storeId, attribution, visitId)
  })
}

export type WhatsappCtaMetrics = {
  accesses: number
  carts: number
  ordersCreated: number
  ordersCompleted: number
  ordersCancelled: number
  completedRevenue: string
  otherIntegrationOrders: number
  attributedOrdersWithoutAccess: number
  retentionDays: 30
}

/** Independent period totals, not a conversion cohort. Authorization belongs to the action. */
export const readWhatsappCtaMetrics = async (
  storeId: number,
  {
    startDate,
    endDate,
    timeZone,
  }: { startDate?: string; endDate?: string; timeZone: string },
  database: Pick<Database, 'execute'> = db
): Promise<WhatsappCtaMetrics> => {
  if (!Number.isSafeInteger(storeId) || storeId <= 0)
    throw new Error('INVALID_STORE_ID')
  ensureValidReportRange(startDate, endDate)
  if (!isSupportedReportTimeZone(timeZone)) throw new Error('INVALID_TIME_ZONE')
  const period = (column: SQL) =>
    and(
      startDate
        ? sql`${column} >= (${startDate}::date::timestamp at time zone ${timeZone})`
        : undefined,
      endDate
        ? sql`${column} < ((${endDate}::date + interval '1 day')::timestamp at time zone ${timeZone})`
        : undefined
    ) ?? sql`true`
  const origin = 'whatsapp-bot-digital-menu-cta'
  // Scalar snapshot lookup and EXISTS keep exactly one row per order (no revenue fanout).
  const rows = await database.execute(sql`
    with retained_accesses as (
      select * from ${accesses} where store_id = ${storeId} and created_at >= ${retainedSince}
    ), period_orders as (
      select o.*, coalesce(nullif(o.snapshot->'attribution', 'null'::jsonb), (
        select s.customer_snapshot->'attribution' from ${publicOrderSubmissionsTable} s
        where s.store_id = o.store_id and s.order_id = o.id
        order by s.created_at desc, s.id limit 1
      )) as attribution
      from ${ordersTable} o where o.store_id = ${storeId} and ${period(sql`o.created_at`)}
    ), order_metrics as (
      select
        count(distinct o.id) filter (where o.origin = ${origin})::int as "ordersCreated",
        count(distinct o.id) filter (where o.origin = ${origin} and o.status = 'COMPLETED')::int as "ordersCompleted",
        count(distinct o.id) filter (where o.origin = ${origin} and o.status = 'CANCELLED')::int as "ordersCancelled",
        coalesce(sum(o.total_price) filter (where o.origin = ${origin} and o.status = 'COMPLETED'), 0)::text as "completedRevenue",
        count(distinct o.id) filter (where o.origin is distinct from ${origin} and (
          lower(trim(coalesce(o.origin, ''))) not in ('', 'pos', 'manual', 'digital_menu', 'cardapio-digital')
          or (o.type <> 'INDOOR' and o.sales_channel <> 'POS'
            and not (o.sales_channel = 'DIGITAL_MENU' and o.type in ('DELIVERY', 'TAKEOUT')))
        ))::int as "otherIntegrationOrders",
        count(distinct o.id) filter (where o.origin = ${origin} and not exists (
          select 1 from retained_accesses a
          where a.id::text = lower(o.attribution->>'visitId')
            and a.conversation_id::text = lower(o.attribution->>'conversationId')
            and a.message_id = o.attribution->>'messageId'
        ))::int as "attributedOrdersWithoutAccess"
      from period_orders o
    )
    select
      (select count(*)::int from retained_accesses where ${period(sql`created_at`)}) as accesses,
      (select count(*)::int from retained_accesses where cart_at is not null and ${period(sql`cart_at`)}) as carts,
      order_metrics.* from order_metrics
  `)
  const row = rows[0] as Omit<WhatsappCtaMetrics, 'retentionDays'>
  return {
    accesses: Number(row.accesses),
    carts: Number(row.carts),
    ordersCreated: Number(row.ordersCreated),
    ordersCompleted: Number(row.ordersCompleted),
    ordersCancelled: Number(row.ordersCancelled),
    completedRevenue: String(row.completedRevenue),
    otherIntegrationOrders: Number(row.otherIntegrationOrders),
    attributedOrdersWithoutAccess: Number(row.attributedOrdersWithoutAccess),
    retentionDays: 30,
  }
}
