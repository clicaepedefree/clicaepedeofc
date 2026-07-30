import type { OrderTransitionAction } from './audit-policy'

type TransitionFieldsInput = {
  action: OrderTransitionAction
  now: Date
  actorUserId: string
  reason: string | null
  estimatedMinutes?: number
}

export function buildOrderTransitionPersistenceFields({
  action,
  now,
  actorUserId,
  reason,
  estimatedMinutes,
}: TransitionFieldsInput) {
  const normalizedEstimatedMinutes =
    action === 'accept' &&
    Number.isFinite(estimatedMinutes) &&
    estimatedMinutes !== undefined &&
    estimatedMinutes > 0
      ? Math.min(Math.max(Math.round(estimatedMinutes), 5), 240)
      : null

  if (action === 'accept') {
    const estimateFields = normalizedEstimatedMinutes
      ? {
          deliveryEstimatedMinutes: normalizedEstimatedMinutes,
          deliveryEta: new Date(
            now.getTime() + normalizedEstimatedMinutes * 60 * 1000
          ),
        }
      : {}

    return {
      normalizedEstimatedMinutes,
      orderStatusFields: {
        acceptedAt: now,
        acceptedByUserId: actorUserId,
        ...estimateFields,
      },
      publicOrderStatusFields: {
        acceptedAt: now,
        acceptedByUserId: actorUserId,
      },
    }
  }

  if (action === 'reject') {
    return {
      normalizedEstimatedMinutes,
      orderStatusFields: {
        rejectedAt: now,
        rejectedByUserId: actorUserId,
        rejectionReason: reason,
      },
      publicOrderStatusFields: {
        rejectedAt: now,
        rejectedByUserId: actorUserId,
        rejectionReason: reason,
      },
    }
  }

  if (action === 'cancel') {
    return {
      normalizedEstimatedMinutes,
      orderStatusFields: { cancelledAt: now },
      publicOrderStatusFields: { cancelledAt: now },
    }
  }

  if (action === 'complete') {
    return {
      normalizedEstimatedMinutes,
      orderStatusFields: { completedAt: now },
      publicOrderStatusFields: { completedAt: now },
    }
  }

  return {
    normalizedEstimatedMinutes,
    orderStatusFields: {},
    publicOrderStatusFields: {},
  }
}
