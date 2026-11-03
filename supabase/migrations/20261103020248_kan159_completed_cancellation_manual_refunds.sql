-- Documentary reconciliation only: no payment, inventory or cash mutation.
begin;
create table public.manual_refunds (
  id serial primary key,
  store_id integer not null,
  order_id integer not null,
  idempotency_key text not null,
  reason text not null,
  actor_user_id uuid not null,
  payment_snapshot jsonb not null,
  review_status text not null,
  confirmation_key text,
  confirmation_reason text,
  confirmed_by_user_id uuid,
  confirmed_at timestamptz,
  created_at timestamptz not null default current_timestamp,
  constraint manual_refunds_order_store_fk foreign key (order_id, store_id)
    references public.orders(id, store_id) on delete restrict,
  constraint manual_refunds_actor_store_fk foreign key (actor_user_id, store_id)
    references public.user_store_permissions(user_id, store_id) on delete restrict,
  constraint manual_refunds_confirmer_store_fk foreign key (confirmed_by_user_id, store_id)
    references public.user_store_permissions(user_id, store_id) on delete restrict,
  constraint manual_refunds_reason_check check (length(btrim(reason)) between 1 and 1000),
  constraint manual_refunds_state_check check (
    jsonb_typeof(payment_snapshot) = 'array' and (
      (review_status = 'not_required' and jsonb_array_length(payment_snapshot) = 0) or
      (review_status in ('manual_review_pending', 'documented') and jsonb_array_length(payment_snapshot) > 0))),
  constraint manual_refunds_confirmation_check check (
    (review_status = 'documented' and confirmation_key is not null and
      confirmation_reason is not null and length(btrim(confirmation_reason)) between 1 and 1000 and
      confirmed_by_user_id is not null and confirmed_at is not null) or
    (review_status <> 'documented' and confirmation_key is null and
      confirmation_reason is null and confirmed_by_user_id is null and confirmed_at is null))
);
create unique index manual_refunds_order_store_unique on public.manual_refunds(order_id, store_id);
create unique index manual_refunds_store_command_unique on public.manual_refunds(store_id, idempotency_key);
create unique index manual_refunds_store_confirmation_unique on public.manual_refunds(store_id, confirmation_key);
alter table public.manual_refunds enable row level security;
alter table public.manual_refunds force row level security;
revoke all on public.manual_refunds from PUBLIC, anon, authenticated, service_role;
revoke all on sequence public.manual_refunds_id_seq from PUBLIC, anon, authenticated, service_role;

-- No bypass for the privileged backend: origin is immutable, confirmation once.
create function public.guard_manual_refund_history() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP in ('DELETE', 'TRUNCATE') then
    raise exception 'Manual refund history cannot be deleted' using errcode = '23514';
  end if;
  if TG_OP = 'INSERT' then
    if NEW.review_status not in ('not_required', 'manual_review_pending') or
       NEW.confirmation_key is not null or NEW.confirmation_reason is not null or
       NEW.confirmed_by_user_id is not null or NEW.confirmed_at is not null then
      raise exception 'Manual refund must start unconfirmed' using errcode = '23514';
    end if;
    return NEW;
  end if;
  if (to_jsonb(OLD) - array['review_status','confirmation_key','confirmation_reason','confirmed_by_user_id','confirmed_at'])
      is distinct from
     (to_jsonb(NEW) - array['review_status','confirmation_key','confirmation_reason','confirmed_by_user_id','confirmed_at']) then
    raise exception 'Manual refund origin is immutable' using errcode = '23514';
  end if;
  if OLD.review_status <> 'manual_review_pending' or NEW.review_status <> 'documented' or
     OLD.confirmation_key is not null or OLD.confirmation_reason is not null or
     OLD.confirmed_by_user_id is not null or OLD.confirmed_at is not null then
    raise exception 'Manual refund confirmation is one-way and once-only' using errcode = '23514';
  end if;
  return NEW;
end;
$$;
revoke all on function public.guard_manual_refund_history() from PUBLIC, anon, authenticated, service_role;
create trigger manual_refunds_history_guard before insert or update or delete on public.manual_refunds
  for each row execute function public.guard_manual_refund_history();
create trigger manual_refunds_no_truncate before truncate on public.manual_refunds
  for each statement execute function public.guard_manual_refund_history();
comment on table public.manual_refunds is
  'Owner/manager documentary review. PREPAID is recorded receipt, PENDING is not receipt. No automatic cash refund, withdrawal or restock.';
commit;
