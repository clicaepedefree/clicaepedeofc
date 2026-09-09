import Decimal from 'decimal.js'

import { getPublicAppBaseUrl } from '@/shared/lib/domain-config'

export type OrderBenefitNotificationGrant = {
  type: 'cashback' | 'loyalty'
  grantId: string
  earnedAmount?: unknown
  balanceAmount?: unknown
  earnedPoints?: unknown
  balancePoints?: unknown
  expiresAt?: unknown
  ruleDescription?: string | null
  nextRewardDescription?: string | null
}

export type OrderBenefitNotificationInput = {
  storeName: string
  storeSubdomain: string
  orderId: number
  orderDisplayId: string
  customerPhone?: string | null
  orderStatus: string
  snapshot: unknown
}

export type OrderBenefitNotification = {
  eventType: 'cashback' | 'loyalty'
  eventId: string
  grantId: string
  text: string
  payload: Record<string, unknown>
}

const formatCurrency = (value: Decimal) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value.toNumber())

const readRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const readString = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : null

const readPositiveDecimal = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null

  try {
    const decimal = new Decimal(value as Decimal.Value)
    return decimal.isFinite() && decimal.gt(0) ? decimal : null
  } catch {
    return null
  }
}

const readNonNegativeDecimal = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null

  try {
    const decimal = new Decimal(value as Decimal.Value)
    return decimal.isFinite() && decimal.gte(0) ? decimal : null
  } catch {
    return null
  }
}

const readPositiveInteger = (value: unknown) => {
  const numberValue =
    typeof value === 'string' && value.trim()
      ? Number(value)
      : typeof value === 'number'
        ? value
        : NaN

  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null
}

const readNonNegativeInteger = (value: unknown) => {
  const numberValue =
    typeof value === 'string' && value.trim()
      ? Number(value)
      : typeof value === 'number'
        ? value
        : NaN

  return Number.isInteger(numberValue) && numberValue >= 0 ? numberValue : null
}

const formatOptionalDate = (value: unknown) => {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

const buildDigitalMenuCtaUrl = (storeSubdomain: string) => {
  const url = new URL(
    `/cardapio/${encodeURIComponent(storeSubdomain)}`,
    getPublicAppBaseUrl()
  )
  url.searchParams.set('utm_source', 'whatsapp_bot')
  url.searchParams.set('utm_medium', 'transactional')
  url.searchParams.set('utm_campaign', 'benefit_notification')
  return url.toString()
}

const normalizeBenefitGrant = (
  value: unknown
): OrderBenefitNotificationGrant | null => {
  const record = readRecord(value)
  if (!record) return null

  const type =
    record.type === 'cashback' || record.type === 'loyalty' ? record.type : null
  const grantId =
    readString(record.grantId) ??
    readString(record.id) ??
    readString(record.concessionId)

  if (!type || !grantId) return null

  return {
    type,
    grantId,
    earnedAmount: record.earnedAmount ?? record.amount ?? null,
    balanceAmount: record.balanceAmount ?? record.balance ?? null,
    earnedPoints: record.earnedPoints ?? record.points ?? null,
    balancePoints: record.balancePoints ?? record.pointsBalance ?? null,
    expiresAt: (record.expiresAt ?? record.validUntil) as string | Date | null,
    ruleDescription: readString(record.ruleDescription),
    nextRewardDescription: readString(record.nextRewardDescription),
  }
}

export const extractOrderBenefitNotificationGrants = (
  snapshot: unknown
): OrderBenefitNotificationGrant[] => {
  const record = readRecord(snapshot)
  const benefits = readRecord(record?.benefits)
  if (!benefits) return []

  const grants = Array.isArray(benefits.grants)
    ? benefits.grants.map(normalizeBenefitGrant).filter(Boolean)
    : [
        normalizeBenefitGrant(
          readRecord(benefits.cashback)
            ? { type: 'cashback', ...readRecord(benefits.cashback) }
            : null
        ),
        normalizeBenefitGrant(
          readRecord(benefits.loyalty)
            ? { type: 'loyalty', ...readRecord(benefits.loyalty) }
            : null
        ),
      ].filter(Boolean)

  return grants as OrderBenefitNotificationGrant[]
}

export const buildOrderBenefitNotificationEventId = ({
  orderId,
  type,
  grantId,
}: {
  orderId: number
  type: 'cashback' | 'loyalty'
  grantId: string
}) => `order:${orderId}:benefit:${type}:${grantId}`

export function buildOrderBenefitWhatsappNotifications({
  storeName,
  storeSubdomain,
  orderId,
  orderDisplayId,
  customerPhone,
  orderStatus,
  snapshot,
}: OrderBenefitNotificationInput): OrderBenefitNotification[] {
  if (!customerPhone || orderStatus !== 'COMPLETED') return []

  const ctaUrl = buildDigitalMenuCtaUrl(storeSubdomain)
  const notifications: OrderBenefitNotification[] = []

  for (const grant of extractOrderBenefitNotificationGrants(snapshot)) {
    if (grant.type === 'cashback') {
      const earnedAmount = readPositiveDecimal(grant.earnedAmount)
      const balanceAmount = readNonNegativeDecimal(grant.balanceAmount)
      if (!earnedAmount || !balanceAmount) continue

      const details = [
        grant.expiresAt
          ? `Validade: ${formatOptionalDate(grant.expiresAt)}.`
          : null,
        grant.ruleDescription ? `Regra: ${grant.ruleDescription}.` : null,
      ].filter(Boolean)

      notifications.push({
        eventType: 'cashback',
        eventId: buildOrderBenefitNotificationEventId({
          orderId,
          type: 'cashback',
          grantId: grant.grantId,
        }),
        grantId: grant.grantId,
        text: [
          `${storeName}: voce ganhou ${formatCurrency(earnedAmount)} de cashback no pedido #${orderDisplayId}.`,
          `Saldo atualizado: ${formatCurrency(balanceAmount)}.`,
          ...details,
          `Use em uma proxima compra pelo cardapio: ${ctaUrl}`,
        ].join('\n'),
        payload: {
          source: 'order_benefit_finalization',
          benefitType: 'cashback',
          grantId: grant.grantId,
          orderDisplayId,
          earnedAmount: earnedAmount.toFixed(2),
          balanceAmount: balanceAmount.toFixed(2),
          expiresAt: grant.expiresAt ?? null,
          ruleDescription: grant.ruleDescription ?? null,
          ctaUrl,
        },
      })

      continue
    }

    const earnedPoints = readPositiveInteger(grant.earnedPoints)
    const balancePoints = readNonNegativeInteger(grant.balancePoints)
    if (!earnedPoints || balancePoints === null) continue

    const details = [
      grant.nextRewardDescription
        ? `Proxima recompensa: ${grant.nextRewardDescription}.`
        : null,
      grant.ruleDescription ? `Regra: ${grant.ruleDescription}.` : null,
    ].filter(Boolean)

    notifications.push({
      eventType: 'loyalty',
      eventId: buildOrderBenefitNotificationEventId({
        orderId,
        type: 'loyalty',
        grantId: grant.grantId,
      }),
      grantId: grant.grantId,
      text: [
        `${storeName}: voce ganhou ${earnedPoints} ponto${earnedPoints === 1 ? '' : 's'} no pedido #${orderDisplayId}.`,
        `Saldo atualizado: ${balancePoints} ponto${balancePoints === 1 ? '' : 's'}.`,
        ...details,
        `Acompanhe o cardapio para sua proxima compra: ${ctaUrl}`,
      ].join('\n'),
      payload: {
        source: 'order_benefit_finalization',
        benefitType: 'loyalty',
        grantId: grant.grantId,
        orderDisplayId,
        earnedPoints,
        balancePoints,
        nextRewardDescription: grant.nextRewardDescription ?? null,
        ruleDescription: grant.ruleDescription ?? null,
        ctaUrl,
      },
    })
  }

  return notifications
}
