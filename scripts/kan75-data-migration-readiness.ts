import { config } from 'dotenv'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import postgres from 'postgres'
import {
  buildDataMigrationReadinessReport,
  type DataMigrationReadinessInput,
} from '../src/features/internal-operations/data-migration-readiness-policy'

config({ path: '.env.local' })

const args = new Set(process.argv.slice(2))
const outputArg = process.argv
  .slice(2)
  .find(arg => arg.startsWith('--output='))
const formatArg = process.argv
  .slice(2)
  .find(arg => arg.startsWith('--format='))
const outputPath = outputArg?.replace('--output=', '')
const format = formatArg?.replace('--format=', '') ?? 'json'

if (!['json', 'markdown'].includes(format)) {
  throw new Error('Formato invalido. Use --format=json ou --format=markdown.')
}

const connectionString =
  process.env.KAN75_DATABASE_URL ??
  process.env.POSTGRES_URL ??
  process.env.DATABASE_URL

if (!connectionString) {
  throw new Error(
    'Defina KAN75_DATABASE_URL, POSTGRES_URL ou DATABASE_URL para gerar o relatorio.'
  )
}

if (!process.env.KAN75_DATABASE_URL && !args.has('--allow-default-database')) {
  throw new Error(
    'Para evitar leitura acidental do banco errado, use KAN75_DATABASE_URL apontando para uma copia da producao ou passe --allow-default-database explicitamente.'
  )
}

function renderMarkdown(report: ReturnType<typeof buildDataMigrationReadinessReport>) {
  const ambiguityRows = report.ambiguities
    .map(
      item =>
        `| ${item.severity} | ${item.reason} | ${item.entity} #${item.entityId} | ${item.storeId ?? '-'} | ${JSON.stringify(item.details)} |`
    )
    .join('\n')

  return [
    '# KAN-75 - Relatorio de prontidao da migracao',
    '',
    `Gerado em: ${report.generatedAt}`,
    '',
    '## Totais antes',
    '',
    `- Lojas: ${report.totalsBefore.stores}`,
    `- Assinaturas: ${report.totalsBefore.subscriptions}`,
    `- Assinaturas abertas: ${report.totalsBefore.openSubscriptions}`,
    `- Faturas: ${report.totalsBefore.invoices}`,
    `- Total bruto faturado: ${report.totalsBefore.invoiceGrossTotal.toFixed(2)}`,
    `- Total em aberto: ${report.totalsBefore.invoiceOutstandingTotal.toFixed(2)}`,
    `- Modulos do catalogo: ${report.totalsBefore.modules}`,
    `- Vinculos plano-modulo: ${report.totalsBefore.planModules}`,
    `- Entitlements atuais: ${report.totalsBefore.entitlements}`,
    '',
    '## Projecao apos backfill',
    '',
    `- Assinaturas: ${report.projectedAfter.subscriptions}`,
    `- Faturas: ${report.projectedAfter.invoices}`,
    `- Entitlements: ${report.projectedAfter.entitlements}`,
    `- Entitlements de plano ausentes para backfill: ${report.projectedAfter.missingPlanEntitlementsToBackfill}`,
    '',
    '## Revisao manual',
    '',
    `- Bloqueios: ${report.manualReview.blocking}`,
    `- Alertas: ${report.manualReview.warning}`,
    `- Lojas afetadas: ${report.manualReview.storeIds.join(', ') || '-'}`,
    '',
    '## Ambiguidades',
    '',
    '| Severidade | Motivo | Entidade | Loja | Detalhes |',
    '| --- | --- | --- | --- | --- |',
    ambiguityRows || '| - | Nenhuma ambiguidade encontrada | - | - | - |',
    '',
  ].join('\n')
}

async function loadInput(): Promise<DataMigrationReadinessInput> {
  const sql = postgres(connectionString!, { prepare: false })

  try {
    const [
      stores,
      plans,
      modules,
      planModules,
      subscriptions,
      invoices,
      entitlements,
    ] = await Promise.all([
      sql`
        select id, name, subdomain, status
        from stores
        order by id
      `,
      sql`
        select id, code, status
        from billing_plans
        order by id
      `,
      sql`
        select id, code, status
        from billing_modules
        order by id
      `,
      sql`
        select
          id,
          plan_id as "planId",
          module_id as "moduleId",
          status,
          ends_at as "endsAt"
        from billing_plan_modules
        order by id
      `,
      sql`
        select
          id,
          store_id as "storeId",
          plan_id as "planId",
          status,
          contracted_amount as "contractedAmount",
          currency,
          billing_interval as "billingInterval",
          billing_interval_count as "billingIntervalCount",
          current_period_start as "currentPeriodStart",
          current_period_end as "currentPeriodEnd",
          next_billing_at as "nextBillingAt"
        from store_subscriptions
        order by id
      `,
      sql`
        select
          id,
          store_id as "storeId",
          subscription_id as "subscriptionId",
          plan_id as "planId",
          status,
          subtotal_amount as "subtotalAmount",
          discount_amount as "discountAmount",
          total_amount as "totalAmount",
          amount_paid as "amountPaid",
          amount_refunded as "amountRefunded",
          period_start as "periodStart",
          period_end as "periodEnd",
          due_at as "dueAt"
        from store_billing_invoices
        order by id
      `,
      sql`
        select
          id,
          store_id as "storeId",
          module_id as "moduleId",
          subscription_id as "subscriptionId",
          plan_id as "planId",
          plan_module_id as "planModuleId",
          origin,
          status,
          is_additional as "isAdditional",
          additional_amount as "additionalAmount",
          ends_at as "endsAt",
          revoked_at as "revokedAt"
        from store_module_entitlements
        order by id
      `,
    ])

    return {
      generatedAt: new Date(),
      stores: stores as unknown as DataMigrationReadinessInput['stores'],
      plans: plans as unknown as DataMigrationReadinessInput['plans'],
      modules: modules as unknown as DataMigrationReadinessInput['modules'],
      planModules:
        planModules as unknown as DataMigrationReadinessInput['planModules'],
      subscriptions:
        subscriptions as unknown as DataMigrationReadinessInput['subscriptions'],
      invoices: invoices as unknown as DataMigrationReadinessInput['invoices'],
      entitlements:
        entitlements as unknown as DataMigrationReadinessInput['entitlements'],
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
}

async function main() {
  const input = await loadInput()
  const report = buildDataMigrationReadinessReport(input)
  const content =
    format === 'markdown'
      ? renderMarkdown(report)
      : `${JSON.stringify(report, null, 2)}\n`

  if (outputPath) {
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, content, 'utf8')
    console.log(`Relatorio KAN-75 gerado em ${outputPath}`)
    return
  }

  console.log(content)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
