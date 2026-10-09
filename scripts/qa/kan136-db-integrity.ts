import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import postgres from 'postgres'

const sql = postgres(process.env.POSTGRES_URL!, {
  prepare: false,
  max: 1,
  connect_timeout: 15,
})
const cases: { id: string; status: string; proof?: unknown; error?: string }[] =
  []
const rollback = new Error('QA_ROLLBACK_ONLY')
async function main() {
  try {
    await sql.begin(async tx => {
      const run = 'KAN136-' + randomUUID()
      const phone = '+5500000000001'
      const other = (
        await tx`select id from stores where id<>9 order by id limit 1`
      )[0]?.id
      assert(
        other,
        'Another existing tenant required for rollback-only constraint tests'
      )
      assert.equal(
        (
          await tx`select id from whatsapp_bot_contacts where phone_number=${phone} and store_id in (9,${other})`
        ).length,
        0,
        'Fixture already exists; refusing overwrite'
      )
      const first = (
        await tx`insert into whatsapp_bot_contacts(store_id,phone_number,display_name,source,metadata) values(9,${phone},'QA KAN136 rollback','manual',${tx.json({ qaRun: run })}) returning id`
      )[0].id
      const second = (
        await tx`insert into whatsapp_bot_contacts(store_id,phone_number,display_name,source,metadata) values(${other},${phone},'QA KAN136 rollback','manual',${tx.json({ qaRun: run })}) returning id`
      )[0].id
      assert.notEqual(first, second)
      cases.push({
        id: 'DB-same-phone-different-stores',
        status: 'PASS',
        proof: { separateContactIds: true, committed: false },
      })
      const reject = async (
        id: string,
        state: string,
        work: (sp: any) => Promise<unknown>
      ) => {
        try {
          await tx.savepoint(work)
          cases.push({
            id,
            status: 'FAIL',
            error: 'Invalid relation was accepted',
          })
        } catch (error) {
          cases.push({
            id,
            status:
              (error as { code?: string }).code === state ? 'PASS' : 'FAIL',
            proof: {
              expectedSqlState: state,
              observedSqlState: (error as { code?: string }).code,
              committed: false,
            },
          })
        }
      }
      await reject(
        'DB-same-store-contact-duplicate',
        '23505',
        sp =>
          sp`insert into whatsapp_bot_contacts(store_id,phone_number) values(9,${phone})`
      )
      await reject(
        'DB-cross-tenant-conversation',
        '23503',
        sp =>
          sp`insert into whatsapp_bot_conversations(store_id,contact_id) values(9,${second})`
      )
      const conversation = (
        await tx`insert into whatsapp_bot_conversations(store_id,contact_id) values(9,${first}) returning id`
      )[0].id
      await reject(
        'DB-cross-tenant-message',
        '23503',
        sp =>
          sp`insert into whatsapp_bot_messages(store_id,conversation_id,contact_id,provider_message_id,direction,sender_type,message_type,body,status) values(9,${conversation},${second},${run},'inbound','customer','text','QA rollback','received')`
      )
      const session = (
        await tx`select id from whatsapp_bot_sessions where store_id=9 limit 1`
      )[0]?.id
      assert(session)
      await reject(
        'DB-cross-tenant-session',
        '23503',
        sp =>
          sp`insert into whatsapp_bot_conversations(store_id,contact_id,session_id) values(${other},${second},${session})`
      )
      throw rollback
    })
  } catch (error) {
    if (error !== rollback)
      cases.push({
        id: 'DB-integrity-execution',
        status: 'BLOCKED',
        error: 'Database test incomplete; private details withheld',
      })
  } finally {
    try {
      const residue = (
        await sql`select count(*)::int n from whatsapp_bot_contacts where phone_number='+5500000000001' and display_name='QA KAN136 rollback'`
      )[0].n
      cases.push({
        id: 'DB-rollback-cleanup',
        status: residue === 0 ? 'PASS' : 'FAIL',
        proof: { remainingOwnedFixtures: residue },
      })
    } catch {
      cases.push({
        id: 'DB-rollback-cleanup',
        status: 'BLOCKED',
        error: 'Cleanup verification unavailable; no acceptance',
      })
    }
    await sql.end().catch(() => {
      process.exitCode = 1
      cases.push({
        id: 'DB-close',
        status: 'BLOCKED',
        error: 'Database client close failed',
      })
    })
    const root =
      process.env.QA_ARTIFACT_ROOT || 'D:/ProjetoIA/codex/clicaepede/KAN-136'
    await mkdir(root, { recursive: true })
    await writeFile(
      root + '/db-integrity-evidence.json',
      JSON.stringify(
        { kind: 'live-db-rollback-only-not-browser-or-transport', cases },
        null,
        2
      )
    )
    console.log(
      JSON.stringify({
        pass: cases.filter(c => c.status === 'PASS').length,
        fail: cases.filter(c => c.status !== 'PASS').length,
      })
    )
    if (cases.some(c => c.status !== 'PASS')) process.exitCode = 1
  }
}
void main().catch(() => {
  console.error('DB integrity report incomplete; no acceptance')
  process.exitCode = 1
})
