import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PgDialect } from 'drizzle-orm/pg-core'
import {
  applyDueStoreSubscriptionPlanChangeCandidates,
  buildInternalStoreWhere,
  buildInternalStoreInitialInvoiceNumber,
  getInvoiceReceivableAmount,
  getInternalStoreProvisioningPayloadHash,
  getMonthlyContractedRevenue,
  normalizeInternalAuditLogPagination,
  maskInternalStoreEmail,
  maskInternalStoreSensitiveDigits,
  parseInternalStoreAccessFilter,
  parseInternalStoreDateFilter,
  parseStoreStatus,
  parseInternalDashboardAmount,
  parseInternalStorePositiveInteger,
  protectInternalPersonalDigits,
  protectInternalPersonalEmail,
  protectInternalPersonalRecipient,
  protectInternalPersonalText,
  protectInternalRequiredPersonalEmail,
  shouldCreateInternalStoreInitialInvoice,
} from './db'
import type { InternalStoreCreationValues } from './internal-store-creation-policy'

const provisioningValues: InternalStoreCreationValues = {
  responsibleName: 'QA Admin',
  responsibleEmail: 'qa.admin@example.com',
  responsiblePhone: '11999999999',
  responsibleTaxNumber: '52998224725',
  storeName: 'QA Loja Centro',
  subdomain: 'qa-loja-centro',
  companyTaxNumber: '04252011000110',
  companyName: 'QA Loja Centro',
  phone1: '1133333333',
  companyEmail: 'loja@example.com',
  postalCode: '01001000',
  street: 'Praca da Se',
  number: '100',
  district: 'Se',
  city: 'Sao Paulo',
  stateCode: 'SP',
  planId: 1,
  contractedAmount: '199.9000',
  discountType: 'none',
  discountValue: '',
  selectedModuleIds: [1, 2],
  sendAccessImmediately: true,
  duplicateOverrideConfirmed: false,
  duplicateReviewToken: '',
  provisioningIdempotencyKey: 'kan-40-idempotency-key',
  reviewConfirmed: true,
  reviewFingerprint: '',
  reason: 'Novo cliente aprovado pelo comercial.',
}

describe('internal operation store policy', () => {
  test('accepts only known store lifecycle statuses for internal filters', () => {
    expect(parseStoreStatus('implementing')).toBe('implementing')
    expect(parseStoreStatus('active')).toBe('active')
    expect(parseStoreStatus('inactive')).toBe('inactive')
    expect(parseStoreStatus('pending_recovery')).toBe('pending_recovery')
    expect(parseStoreStatus('archived')).toBe('archived')
    expect(parseStoreStatus('deleted')).toBe(undefined)
    expect(parseStoreStatus(undefined)).toBe(undefined)
  })

  test('accepts only known access filters for internal store listing', () => {
    expect(parseInternalStoreAccessFilter('with_active_admin')).toBe(
      'with_active_admin'
    )
    expect(parseInternalStoreAccessFilter('without_active_admin')).toBe(
      'without_active_admin'
    )
    expect(parseInternalStoreAccessFilter('with_revoked_admin')).toBe(
      'with_revoked_admin'
    )
    expect(parseInternalStoreAccessFilter('all')).toBe(undefined)
    expect(parseInternalStoreAccessFilter(undefined)).toBe(undefined)
  })

  test('normalizes positive pagination and filter ids', () => {
    expect(parseInternalStorePositiveInteger('1')).toBe(1)
    expect(parseInternalStorePositiveInteger(25)).toBe(25)
    expect(parseInternalStorePositiveInteger('0')).toBe(undefined)
    expect(parseInternalStorePositiveInteger('-1')).toBe(undefined)
    expect(parseInternalStorePositiveInteger('1.5')).toBe(undefined)
    expect(parseInternalStorePositiveInteger('abc')).toBe(undefined)
  })

  test('normalizes store audit log pagination with safe limits', () => {
    expect(
      normalizeInternalAuditLogPagination({
        page: 2,
        perPage: 12,
        totalItems: 31,
      })
    ).toEqual({
      page: 2,
      perPage: 12,
      totalItems: 31,
      totalPages: 3,
      hasPreviousPage: true,
      hasNextPage: true,
    })

    expect(
      normalizeInternalAuditLogPagination({
        page: -10,
        perPage: 500,
        totalItems: 3,
      })
    ).toEqual({
      page: 1,
      perPage: 50,
      totalItems: 3,
      totalPages: 1,
      hasPreviousPage: false,
      hasNextPage: false,
    })
  })

  test('keeps internal operation audit logs append-only at the database layer', () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        'supabase/migrations/20260822033000_kan79_internal_audit_append_only.sql'
      ),
      'utf8'
    )

    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION "reject_internal_operation_audit_log_mutation"()'
    )
    expect(migration).toContain(
      'CREATE TRIGGER "internal_operation_audit_logs_append_only"'
    )
    expect(migration).toContain(
      'BEFORE UPDATE OR DELETE ON "internal_operation_audit_logs"'
    )
    expect(migration).toContain(
      'CREATE TRIGGER "internal_operation_audit_logs_no_truncate"'
    )
    expect(migration).toContain(
      'BEFORE TRUNCATE ON "internal_operation_audit_logs"'
    )
    expect(migration).toContain(
      'ALTER TABLE "internal_operation_audit_logs" FORCE ROW LEVEL SECURITY'
    )
    expect(migration).toContain(
      'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "internal_operation_audit_logs" FROM service_role'
    )
    expect(migration).toContain(
      'GRANT SELECT, INSERT ON TABLE "internal_operation_audit_logs" TO service_role'
    )
  })

  test('parses internal store date filters at day boundaries', () => {
    expect(
      parseInternalStoreDateFilter('2026-07-09', 'start')?.toISOString()
    ).toBe('2026-07-09T00:00:00.000Z')
    expect(
      parseInternalStoreDateFilter('2026-07-09', 'end')?.toISOString()
    ).toBe('2026-07-09T23:59:59.999Z')
    expect(parseInternalStoreDateFilter('09/07/2026', 'start')).toBe(
      undefined
    )
    expect(parseInternalStoreDateFilter(undefined, 'start')).toBe(undefined)
  })

  test('combines textual and digit store search as alternatives', () => {
    const dialect = new PgDialect()
    const where = buildInternalStoreWhere({
      search: 'kan42-accept-kan101111633',
      status: 'active',
      planId: 1,
      access: undefined,
      city: undefined,
      createdFrom: undefined,
      createdTo: undefined,
    })

    expect(where).toBeDefined()

    const query = dialect.sqlToQuery(where!)

    expect(query.params).toContain('%kan42-accept-kan101111633%')
    expect(query.params).toContain('kan42-accept-kan101111633')
    expect(query.params).toContain('%42101111633%')
    expect(query.sql).toContain('"stores"."status" = $1')
    expect(query.sql).toContain('"store_subscriptions"."plan_id" = $2')
    expect(query.sql).toContain(
      `lower(coalesce("store_company_profiles"."responsible_email", '')) like`
    )
    expect(query.sql).toContain(
      `regexp_replace(coalesce("store_company_profiles"."company_tax_number", ''), '\\D', '', 'g') like`
    )
    expect(query.sql).toContain(') or (')
    expect(query.sql).not.toContain(
      `lower("store_company_profiles"."responsible_email") like $3) and (regexp_replace`
    )
  })

  test('masks sensitive document and phone digits for internal listings', () => {
    expect(
      maskInternalStoreSensitiveDigits('04.252.011/0001-10', 'nao informado')
    ).toBe('***0110')
    expect(
      maskInternalStoreSensitiveDigits('(11) 99999-1234', 'nao informado')
    ).toBe('***1234')
    expect(maskInternalStoreSensitiveDigits('', 'nao informado')).toBe(
      'nao informado'
    )
  })

  test('masks personal e-mail while preserving operational context', () => {
    expect(maskInternalStoreEmail('responsavel@cliente.com')).toBe(
      're***@cliente.com'
    )
    expect(maskInternalStoreEmail('a@cliente.com')).toBe('a***@cliente.com')
    expect(maskInternalStoreEmail('sem-dominio')).toBe('e-mail informado')
  })

  test('protects internal personal values according to role visibility', () => {
    expect(
      protectInternalRequiredPersonalEmail({
        value: 'operador@clicaepede.com',
        canViewPersonalData: false,
      })
    ).toBe('op***@clicaepede.com')
    expect(
      protectInternalPersonalEmail({
        value: 'financeiro@cliente.com',
        canViewPersonalData: false,
      })
    ).toBe('fi***@cliente.com')
    expect(
      protectInternalPersonalDigits({
        value: '(11) 99999-1234',
        fallback: 'telefone informado',
        canViewPersonalData: false,
      })
    ).toBe('***1234')

    expect(
      protectInternalRequiredPersonalEmail({
        value: 'operador@clicaepede.com',
        canViewPersonalData: true,
      })
    ).toBe('operador@clicaepede.com')
    expect(
      protectInternalPersonalDigits({
        value: '(11) 99999-1234',
        fallback: 'telefone informado',
        canViewPersonalData: true,
      })
    ).toBe('(11) 99999-1234')
  })

  test('protects billing reminder recipients by detected contact type', () => {
    expect(
      protectInternalPersonalRecipient({
        value: 'cobranca@cliente.com',
        canViewPersonalData: false,
      })
    ).toBe('co***@cliente.com')
    expect(
      protectInternalPersonalRecipient({
        value: '+55 (11) 98888-7777',
        canViewPersonalData: false,
      })
    ).toBe('***7777')
    expect(
      protectInternalPersonalRecipient({
        value: 'canal interno',
        canViewPersonalData: false,
      })
    ).toBe('destinatario informado')
    expect(
      protectInternalPersonalRecipient({
        value: '+55 (11) 98888-7777',
        canViewPersonalData: true,
      })
    ).toBe('+55 (11) 98888-7777')
  })

  test('protects free-form internal profile text according to role visibility', () => {
    expect(
      protectInternalPersonalText({
        value: 'Rua Cliente Secreto, 147',
        fallback: 'endereco informado',
        canViewPersonalData: false,
      })
    ).toBe('endereco informado')
    expect(
      protectInternalPersonalText({
        value: 'Cliente pediu contato apenas com financeiro',
        fallback: 'observacao interna informada',
        canViewPersonalData: false,
      })
    ).toBe('observacao interna informada')
    expect(
      protectInternalPersonalText({
        value: 'Rua Cliente Secreto, 147',
        fallback: 'endereco informado',
        canViewPersonalData: true,
      })
    ).toBe('Rua Cliente Secreto, 147')
    expect(
      protectInternalPersonalText({
        value: null,
        fallback: 'endereco informado',
        canViewPersonalData: false,
      })
    ).toBeNull()
  })

  test('builds deterministic initial invoice numbers from provisioned ids', () => {
    expect(
      buildInternalStoreInitialInvoiceNumber({
        storeId: 123,
        subscriptionId: 456,
      })
    ).toBe('CP-123-456-001')
  })

  test('creates initial invoice only for active non-trial subscriptions', () => {
    expect(shouldCreateInternalStoreInitialInvoice('active')).toBe(true)
    expect(shouldCreateInternalStoreInitialInvoice('trialing')).toBe(false)
  })

  test('normalizes contracted revenue to monthly values', () => {
    expect(
      getMonthlyContractedRevenue({
        contractedAmount: '199.90',
        billingInterval: 'monthly',
        billingIntervalCount: 1,
      })
    ).toBe(199.9)
    expect(
      getMonthlyContractedRevenue({
        contractedAmount: '599.70',
        billingInterval: 'quarterly',
        billingIntervalCount: 1,
      })
    ).toBe(199.9)
    expect(
      getMonthlyContractedRevenue({
        contractedAmount: '2398.80',
        billingInterval: 'annual',
        billingIntervalCount: 1,
      })
    ).toBe(199.9)
  })

  test('calculates open invoice receivables from invoice balance', () => {
    expect(
      getInvoiceReceivableAmount({
        totalAmount: '200.00',
        amountPaid: '50.00',
      })
    ).toBe(150)
    expect(
      getInvoiceReceivableAmount({
        totalAmount: '100.00',
        amountPaid: '150.00',
      })
    ).toBe(0)
  })

  test('ignores invalid dashboard amounts instead of leaking NaN', () => {
    expect(parseInternalDashboardAmount('abc')).toBe(0)
    expect(parseInternalDashboardAmount(null)).toBe(0)
    expect(parseInternalDashboardAmount('10.50')).toBe(10.5)
  })

  test('hashes provisioning payload for idempotent retries without duplicate review token noise', () => {
    const firstHash =
      getInternalStoreProvisioningPayloadHash(provisioningValues)
    const secondHash = getInternalStoreProvisioningPayloadHash({
      ...provisioningValues,
      duplicateOverrideConfirmed: true,
      duplicateReviewToken: 'server-signed-token',
      reviewConfirmed: false,
      reviewFingerprint: 'outdated-review',
    })
    const changedPayloadHash = getInternalStoreProvisioningPayloadHash({
      ...provisioningValues,
      storeName: 'Outra Loja',
    })

    expect(firstHash).toHaveLength(64)
    expect(secondHash).toBe(firstHash)
    expect(changedPayloadHash === firstHash).toBe(false)
  })

  test('records scheduled plan change batch evidence for partial failures', async () => {
    const result = await applyDueStoreSubscriptionPlanChangeCandidates({
      candidates: [
        { id: 73_101, storeId: 73_001 },
        { id: 73_102, storeId: 73_002 },
        { id: 73_103, storeId: 73_003 },
      ],
      now: new Date('2026-08-21T12:00:00.000Z'),
      applyPlanChange: async ({ planChangeId }) => {
        if (planChangeId === 73_102) {
          throw new Error('PLAN_CHANGE_REQUIRES_ACTIVE_SUBSCRIPTION')
        }

        return {
          planChange: {
            id: planChangeId,
            storeId: planChangeId === 73_101 ? 73_001 : 73_003,
          },
          appliedSubscription: {
            id: planChangeId === 73_101 ? 88_001 : 88_003,
          },
        }
      },
    })

    expect(result).toEqual({
      processedPlanChanges: 3,
      applied: 2,
      failed: 1,
      processed: [
        {
          planChangeId: 73_101,
          storeId: 73_001,
          subscriptionId: 88_001,
          status: 'applied',
        },
        {
          planChangeId: 73_102,
          storeId: 73_002,
          status: 'failed',
          reason: 'PLAN_CHANGE_REQUIRES_ACTIVE_SUBSCRIPTION',
        },
        {
          planChangeId: 73_103,
          storeId: 73_003,
          subscriptionId: 88_003,
          status: 'applied',
        },
      ],
    })
  })
})
