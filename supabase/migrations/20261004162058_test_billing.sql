-- Enable only after prices, signed webhooks and the customer portal are verified.
create table public.billing_settings (
 id boolean primary key default true check(id), enabled boolean not null default false
);
insert into public.billing_settings(id) values(true);
create table public.billing_customers (
 user_id uuid primary key references auth.users(id) on delete cascade,
 stripe_customer_id text not null unique,
 created_at timestamptz not null default now(),
 checkout_lock_token uuid, checkout_lock_until timestamptz
);
create table public.test_credits (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 source text not null unique,
 kind text not null check(kind in ('single','monthly')),
 quantity integer not null check(quantity > 0),
 remaining integer not null check(remaining >= 0 and remaining <= quantity),
 starts_at timestamptz not null default now(), expires_at timestamptz,
 payment_intent_id text, subscription_id text, revoked boolean not null default false,
 created_at timestamptz not null default now(),
 check(expires_at is null or expires_at > starts_at)
);
create index test_credits_owner on public.test_credits(user_id, expires_at);
create index test_credits_payment on public.test_credits(payment_intent_id) where payment_intent_id is not null;
create table public.audit_credit_usage (
 audit_id uuid primary key references public.audits(id) on delete cascade,
 credit_id uuid not null references public.test_credits(id),
 refunded boolean not null default false
);
create index audit_credit_usage_credit on public.audit_credit_usage(credit_id);
alter table public.billing_settings enable row level security;
alter table public.billing_customers enable row level security;
alter table public.test_credits enable row level security;
alter table public.audit_credit_usage enable row level security;
create policy billing_settings_read on public.billing_settings for select to authenticated using(true);
create policy billing_customers_read on public.billing_customers for select to authenticated using(user_id=(select auth.uid()));
create policy test_credits_read on public.test_credits for select to authenticated using(user_id=(select auth.uid()));
create policy audit_credit_usage_read on public.audit_credit_usage for select to authenticated using(exists(select 1 from public.audits a where a.id=audit_id and a.user_id=(select auth.uid())));
revoke all on public.billing_settings,public.billing_customers,public.test_credits,public.audit_credit_usage from public,anon,authenticated;
grant select on public.billing_settings,public.billing_customers,public.test_credits,public.audit_credit_usage to authenticated;
grant all on public.billing_settings,public.billing_customers,public.test_credits,public.audit_credit_usage to service_role;

-- Private, trigger-only definer functions: clients cannot grant or spend credits.
create schema if not exists billing_private;
revoke all on schema billing_private from public,anon,authenticated;
create function billing_private.charge_audit() returns trigger
language plpgsql security definer set search_path='' as $$
declare credit uuid;
begin
 if not (select enabled from public.billing_settings where id=true) then return new; end if;
 -- Authorize the original caller before accessing private billing rows.
 if auth.uid() is not null and new.user_id <> auth.uid() then
   raise exception 'UNAUTHORIZED';
 end if;
 -- Serialize audit insertion per owner, including queue limits and the last credit.
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
 if (select count(*) from public.audits where user_id=new.user_id and status in ('queued','running')) > 3 then
   raise exception 'AUDIT_QUEUE_FULL';
 end if;
 select id into credit from public.test_credits
 where user_id=new.user_id and remaining>0 and not revoked and starts_at<=now()
   and (expires_at is null or expires_at>now())
 order by expires_at nulls last,created_at for update limit 1;
 if credit is null then raise exception 'TEST_CREDITS_REQUIRED'; end if;
 update public.test_credits set remaining=remaining-1 where id=credit;
 -- The audit exists by the time the AFTER trigger executes.
 insert into public.audit_credit_usage(audit_id,credit_id) values(new.id,credit);
 return new;
end;
$$;
create trigger charge_audit after insert on public.audits
for each row execute function billing_private.charge_audit();

create function billing_private.refund_failed_audit() returns trigger
language plpgsql security definer set search_path='' as $$
declare credit uuid;
begin
 if new.status='failed' and old.status<> 'failed' then
   update public.audit_credit_usage set refunded=true
   where audit_id=new.id and not refunded returning credit_id into credit;
   if credit is not null then
     update public.test_credits set remaining=least(quantity,remaining+1) where id=credit;
   end if;
 end if;
 return new;
end;
$$;
create trigger refund_failed_audit after update of status on public.audits
for each row execute function billing_private.refund_failed_audit();
revoke all on function billing_private.charge_audit(),billing_private.refund_failed_audit() from public,anon,authenticated;

-- Remember reversals even if the refund webhook arrives before the paid webhook.
create table billing_private.reversed_payments(payment_id text primary key);
alter table billing_private.reversed_payments enable row level security;
revoke all on billing_private.reversed_payments from public,anon,authenticated;
grant usage on schema billing_private to service_role;
grant all on billing_private.reversed_payments to service_role;
create function public.revoke_test_payment(payment_id text) returns void
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(payment_id, 1));
 insert into billing_private.reversed_payments values(payment_id) on conflict do nothing;
 update public.test_credits set revoked=true where payment_intent_id=payment_id;
end;
$$;
revoke all on function public.revoke_test_payment(text) from public,anon,authenticated;
grant execute on function public.revoke_test_payment(text) to service_role;
create function billing_private.check_payment_reversal() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.payment_intent_id is not null then
   perform pg_advisory_xact_lock(hashtextextended(new.payment_intent_id, 1));
   if exists(select 1 from billing_private.reversed_payments where payment_id=new.payment_intent_id) then
     new.revoked=true;
   end if;
 end if;
 return new;
end;
$$;
create trigger check_payment_reversal before insert on public.test_credits
for each row execute function billing_private.check_payment_reversal();
revoke all on function billing_private.check_payment_reversal() from public,anon,authenticated;

-- Serialize checkout creation across web instances, not just within one process.
create function public.lock_test_checkout(owner_id uuid, lock_token uuid) returns boolean
language sql security invoker set search_path='' as $$
 with locked as (
   update public.billing_customers set checkout_lock_token=lock_token,checkout_lock_until=now()+interval '5 minutes'
   where user_id=owner_id and (checkout_lock_until is null or checkout_lock_until<now()) returning user_id
 ) select exists(select 1 from locked);
$$;
create function public.unlock_test_checkout(owner_id uuid, lock_token uuid) returns void
language sql security invoker set search_path='' as $$
 update public.billing_customers set checkout_lock_token=null,checkout_lock_until=null
 where user_id=owner_id and checkout_lock_token=lock_token;
$$;
revoke all on function public.lock_test_checkout(uuid,uuid),public.unlock_test_checkout(uuid,uuid) from public,anon,authenticated;
grant execute on function public.lock_test_checkout(uuid,uuid),public.unlock_test_checkout(uuid,uuid) to service_role;
