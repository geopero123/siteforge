-- Limits how fast one account can queue audits, whether or not billing is on.
-- Failed audits are refunded, so without a cap one account could loop failing
-- scans for free and use up the worker's shared GitHub quota.
create schema if not exists audit_private;
revoke all on schema audit_private from public, anon, authenticated;

create function audit_private.limit_audits() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Inserts from the service role (no signed-in user) are not limited.
  if auth.uid() is null then
    return new;
  end if;
  -- BEFORE triggers run ahead of RLS, so check ownership before counting.
  if new.user_id is distinct from auth.uid() then
    raise exception 'UNAUTHORIZED';
  end if;
  -- Server time only: a back-dated row could dodge the hourly window and jump
  -- the worker's first-in, first-out queue.
  new.created_at := now();
  -- One audit insert at a time per account, so concurrent requests can't
  -- each see room under the limits.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if (
    select count(*) from public.audits
    where user_id = new.user_id and status in ('queued', 'running')
  ) >= 3 then
    raise exception 'AUDIT_QUEUE_FULL';
  end if;
  if (
    select count(*) from public.audits
    where user_id = new.user_id and created_at > now() - interval '1 hour'
  ) >= 10 then
    raise exception 'AUDIT_RATE_LIMITED';
  end if;
  return new;
end;
$$;
revoke all on function audit_private.limit_audits() from public, anon, authenticated;

create trigger limit_audits before insert on public.audits
for each row execute function audit_private.limit_audits();
