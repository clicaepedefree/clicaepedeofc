import { test } from 'bun:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../../../supabase/migrations/20261103020248_kan159_completed_cancellation_manual_refunds.sql', import.meta.url), 'utf8')

test('private manual refund migration revokes every API role and forces RLS', () => {
  assert.match(migration, /alter table public\.manual_refunds force row level security/i)
  assert.match(migration, /revoke all on public\.manual_refunds from PUBLIC, anon, authenticated, service_role/i)
  assert.match(migration, /revoke all on sequence public\.manual_refunds_id_seq from PUBLIC, anon, authenticated, service_role/i)
  assert.match(migration, /security invoker set search_path = ''/i)
  assert.doesNotMatch(migration, /security definer/i)
})

test('history guard rejects deletion/truncation/origin edits and permits confirmation once only', () => {
  assert.match(migration, /TG_OP in \('DELETE', 'TRUNCATE'\)/)
  assert.match(migration, /before insert or update or delete on public\.manual_refunds/i)
  assert.match(migration, /before truncate on public\.manual_refunds/i)
  assert.match(migration, /NEW\.review_status not in \('not_required', 'manual_review_pending'\)/)
  assert.match(migration, /to_jsonb\(OLD\) - array\['review_status','confirmation_key','confirmation_reason','confirmed_by_user_id','confirmed_at'\]/)
  assert.match(migration, /OLD\.review_status <> 'manual_review_pending' or NEW\.review_status <> 'documented'/)
  assert.match(migration, /foreign key \(actor_user_id, store_id\)[\s\S]*?references public\.user_store_permissions\(user_id, store_id\) on delete restrict/i)
  assert.match(migration, /foreign key \(confirmed_by_user_id, store_id\)[\s\S]*?references public\.user_store_permissions\(user_id, store_id\) on delete restrict/i)
})
