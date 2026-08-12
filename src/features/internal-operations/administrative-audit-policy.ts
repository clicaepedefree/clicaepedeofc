import type { InternalOperator } from '@/features/internal-operations/access'
import type {
  administrativeAuditActions,
  administrativeAuditCriticalities,
  administrativeAuditScopes,
  InsertAdministrativeAuditLog,
  SelectAdministrativeAuditLog,
} from '@/services/db/schema/administrative-audit-logs'

export type AdministrativeAuditScope =
  (typeof administrativeAuditScopes)[number]

export type AdministrativeAuditAction =
  (typeof administrativeAuditActions)[number]

export type AdministrativeAuditCriticality =
  (typeof administrativeAuditCriticalities)[number]

export type AdministrativeAuditSnapshot = Record<string, unknown>

export type AdministrativeAuditInput = {
  operator: InternalOperator
  storeId?: number | null
  scope: AdministrativeAuditScope
  action: AdministrativeAuditAction
  entityType: string
  entityId?: string | number | null
  targetUserId?: string | null
  targetUserEmail?: string | null
  reason: string
  previousValues?: AdministrativeAuditSnapshot | null
  newValues?: AdministrativeAuditSnapshot | null
  metadata?: AdministrativeAuditSnapshot
  criticality?: AdministrativeAuditCriticality
}

export type AdministrativeAuditCursor = Pick<
  SelectAdministrativeAuditLog,
  'id' | 'createdAt'
>

const sensitiveKeys = new Set([
  'password',
  'token',
  'secret',
  'serviceRoleKey',
  'authorization',
  'cookie',
])

const normalizeReason = (reason: string) => {
  const normalized = reason.trim()
  if (!normalized) {
    throw new Error('AUDIT_REASON_REQUIRED')
  }

  return normalized
}

const sanitizeAuditValue = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(sanitizeAuditValue)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      sensitiveKeys.has(key) ? '[redacted]' : sanitizeAuditValue(entry),
    ])
  )
}

const normalizeSnapshot = (
  snapshot?: AdministrativeAuditSnapshot | null
): Record<string, unknown> | null => {
  if (!snapshot || Object.keys(snapshot).length === 0) return null
  return sanitizeAuditValue(snapshot) as Record<string, unknown>
}

export function buildAdministrativeAuditLogInput({
  operator,
  storeId,
  scope,
  action,
  entityType,
  entityId,
  targetUserId,
  targetUserEmail,
  reason,
  previousValues,
  newValues,
  metadata = {},
  criticality = 'required',
}: AdministrativeAuditInput): InsertAdministrativeAuditLog {
  const normalizedPreviousValues = normalizeSnapshot(previousValues)
  const normalizedNewValues = normalizeSnapshot(newValues)

  if (!normalizedPreviousValues && !normalizedNewValues) {
    throw new Error('AUDIT_SNAPSHOT_REQUIRED')
  }

  return {
    storeId: storeId ?? null,
    scope,
    action,
    entityType,
    entityId: entityId == null ? null : String(entityId),
    actorClerkId: operator.clerkId,
    actorEmail: operator.email,
    actorName: operator.name,
    targetUserId: targetUserId ?? null,
    targetUserEmail: targetUserEmail ?? null,
    reason: normalizeReason(reason),
    previousValues: normalizedPreviousValues,
    newValues: normalizedNewValues,
    metadata: normalizeSnapshot(metadata) ?? {},
    criticality,
    status: 'recorded',
    failureMessage: null,
  }
}

export function buildFailedAdministrativeAuditLogInput({
  failureMessage,
  ...input
}: AdministrativeAuditInput & {
  failureMessage: string
}): InsertAdministrativeAuditLog {
  const log = buildAdministrativeAuditLogInput(input)
  const normalizedFailureMessage = failureMessage.trim()

  if (!normalizedFailureMessage) {
    throw new Error('AUDIT_FAILURE_MESSAGE_REQUIRED')
  }

  return {
    ...log,
    status: 'failed',
    failureMessage: normalizedFailureMessage,
  }
}

export function shouldBlockOperationOnAuditFailure(
  criticality: AdministrativeAuditCriticality
) {
  return criticality === 'required'
}
