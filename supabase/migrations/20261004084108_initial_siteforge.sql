create table public.projects (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(name) between 1 and 100), url text not null, repository text,
 created_at timestamptz not null default now()
);
create table public.audits (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, url text not null,
 mode text not null check(mode in ('quick','full','mission')), mission text, allow_form_submission boolean not null default false,
 status text not null default 'queued' check(status in ('queued','running','complete','partial','failed')),
 report jsonb, error text, created_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz, heartbeat_at timestamptz
);
create index audits_queue on public.audits(status,created_at);
create index audits_owner on public.audits(user_id,created_at desc);
create table public.issues (id uuid primary key default gen_random_uuid(), audit_id uuid not null references public.audits(id) on delete cascade, data jsonb not null, status text not null default 'open' check(status in ('open','resolved','ignored')));
create table public.audit_pages (id uuid primary key default gen_random_uuid(),audit_id uuid not null references public.audits(id) on delete cascade,url text not null,evidence jsonb not null,created_at timestamptz not null default now());
create table public.screenshots (id uuid primary key default gen_random_uuid(),audit_id uuid not null references public.audits(id) on delete cascade,path text not null,url text not null,viewport jsonb not null,created_at timestamptz not null default now());
create table public.agent_runs (id bigint generated always as identity primary key,audit_id uuid not null references public.audits(id) on delete cascade,agent text not null,message text not null,status text not null,created_at timestamptz not null default now());
create table public.mission_steps (id bigint generated always as identity primary key,audit_id uuid not null references public.audits(id) on delete cascade,tool text not null,args jsonb,result jsonb,created_at timestamptz not null default now());
alter table public.projects enable row level security;
alter table public.audits enable row level security;
create policy projects_owner on public.projects for all to authenticated using (user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy audits_read on public.audits for select to authenticated using(user_id=(select auth.uid()));
create policy audits_create on public.audits for insert to authenticated with check(user_id=(select auth.uid()) and status='queued' and report is null and error is null and exists(select 1 from public.projects p where p.id=project_id and p.user_id=(select auth.uid())));
do $$ declare t text; begin
 foreach t in array array['issues','audit_pages','screenshots','agent_runs','mission_steps'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy owner_read on public.%I for select to authenticated using (exists(select 1 from public.audits a where a.id=audit_id and a.user_id=(select auth.uid())))',t);
 execute format('create index on public.%I(audit_id)',t);
 end loop;
end $$;
create policy issues_update on public.issues for update to authenticated using(exists(select 1 from public.audits a where a.id=audit_id and a.user_id=(select auth.uid()))) with check(exists(select 1 from public.audits a where a.id=audit_id and a.user_id=(select auth.uid())));
revoke all on public.projects,public.audits,public.issues,public.audit_pages,public.screenshots,public.agent_runs,public.mission_steps from anon,authenticated;
grant select,insert,update,delete on public.projects to authenticated;
grant select,insert on public.audits to authenticated;
grant select on public.issues,public.audit_pages,public.screenshots,public.agent_runs,public.mission_steps to authenticated;
grant update(status) on public.issues to authenticated;
grant all on public.projects,public.audits,public.issues,public.audit_pages,public.screenshots,public.agent_runs,public.mission_steps to service_role;
grant usage,select on all sequences in schema public to service_role;
create function public.claim_audit() returns setof public.audits language sql security invoker set search_path='' as $$
 update public.audits set status='running',started_at=now(),heartbeat_at=now() where id=(select id from public.audits where status='queued' order by created_at for update skip locked limit 1) returning *;
$$;
create function public.expire_audits() returns void language sql security invoker set search_path='' as $$
 update public.audits set status='failed',error='Worker stopped unexpectedly. Start a worker and rerun this audit.',finished_at=now() where status='running' and heartbeat_at<now()-interval '3 minutes';
$$;
revoke all on function public.claim_audit(),public.expire_audits() from public,anon,authenticated;
grant execute on function public.claim_audit(),public.expire_audits() to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('screenshots','screenshots',false,10485760,array['image/png']);
create policy screenshots_owner_read on storage.objects for select to authenticated using(bucket_id='screenshots' and (storage.foldername(name))[1]=(select auth.uid())::text);
