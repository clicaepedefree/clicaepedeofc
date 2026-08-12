import { describe, expect, test } from 'bun:test'
import {
  buildAdministrativeAuditLogInput,
  buildFailedAdministrativeAuditLogInput,
  shouldBlockOperationOnAuditFailure,
} from './administrative-audit-policy'

const operator = {
  clerkId: 'user_admin',
  email: 'admin@clicaepede.com',
  name: 'Admin Clica',
  role: 'superadmin' as const,
}

const errorMessageFor = (callback: () => unknown) => {
  try {
    callback()
    return ''
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

describe('administrative audit policy', () => {
  test('builds an immutable administrative audit payload with before and after state', () => {
    const log = buildAdministrativeAuditLogInput({
      operator,
      storeId: 10,
      scope: 'billing_invoice',
      action: 'update',
      entityType: 'store_billing_invoice',
      entityId: 20,
      reason: 'Ajuste autorizado pelo financeiro',
      previousValues: {
        status: 'pending',
        totalAmount: '199.9000',
      },
      newValues: {
        status: 'paid',
        totalAmount: '199.9000',
      },
      metadata: {
        source: 'internal_operations',
      },
    })

    expect({
      storeId: log.storeId,
      scope: log.scope,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      actorClerkId: log.actorClerkId,
      actorEmail: log.actorEmail,
      actorName: log.actorName,
      reason: log.reason,
      status: log.status,
      criticality: log.criticality,
      failureMessage: log.failureMessage,
    }).toEqual({
      storeId: 10,
      scope: 'billing_invoice',
      action: 'update',
      entityType: 'store_billing_invoice',
      entityId: '20',
      actorClerkId: 'user_admin',
      actorEmail: 'admin@clicaepede.com',
      actorName: 'Admin Clica',
      reason: 'Ajuste autorizado pelo financeiro',
      status: 'recorded',
      criticality: 'required',
      failureMessage: null,
    })
    expect(log.previousValues).toEqual({
      status: 'pending',
      totalAmount: '199.9000',
    })
    expect(log.newValues).toEqual({
      status: 'paid',
      totalAmount: '199.9000',
    })
  })

  test('redacts sensitive fields before persisting snapshots', () => {
    const log = buildAdministrativeAuditLogInput({
      operator,
      scope: 'access',
      action: 'grant',
      entityType: 'user_store_permission',
      entityId: '10:user',
      reason: 'Permissao concedida pelo suporte',
      previousValues: {
        token: 'secret-token',
        nested: {
          password: '123456',
          visible: 'ok',
        },
      },
      newValues: {
        role: 'admin',
        secret: 'private',
      },
    })

    expect(log.previousValues).toEqual({
      token: '[redacted]',
      nested: {
        password: '[redacted]',
        visible: 'ok',
      },
    })
    expect(log.newValues).toEqual({
      role: 'admin',
      secret: '[redacted]',
    })
  })

  test('requires a reason and at least one state snapshot', () => {
    expect(
      errorMessageFor(() =>
        buildAdministrativeAuditLogInput({
          operator,
          scope: 'store_data',
          action: 'update',
          entityType: 'store',
          reason: ' ',
          previousValues: { status: 'active' },
        })
      )
    ).toBe('AUDIT_REASON_REQUIRED')

    expect(
      errorMessageFor(() =>
        buildAdministrativeAuditLogInput({
          operator,
          scope: 'store_data',
          action: 'update',
          entityType: 'store',
          reason: 'Ajuste operacional',
        })
      )
    ).toBe('AUDIT_SNAPSHOT_REQUIRED')
  })

  test('represents failed best-effort audit attempts without marking required logs as optional', () => {
    const failedLog = buildFailedAdministrativeAuditLogInput({
      operator,
      scope: 'module_entitlement',
      action: 'grant',
      entityType: 'store_module_entitlement',
      entityId: 55,
      reason: 'Cortesia comercial',
      previousValues: { status: null },
      newValues: { status: 'active' },
      criticality: 'best_effort',
      failureMessage: 'fila temporariamente indisponivel',
    })

    expect(failedLog.status).toBe('failed')
    expect(failedLog.failureMessage).toBe('fila temporariamente indisponivel')
    expect(shouldBlockOperationOnAuditFailure('required')).toBe(true)
    expect(shouldBlockOperationOnAuditFailure('best_effort')).toBe(false)
  })
})
