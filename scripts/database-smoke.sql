\set ON_ERROR_STOP on
begin;
insert into auth.users values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into public.projects(id,user_id,name,url) values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Alice','https://example.com'),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','Bob','https://example.org');
insert into public.audits(id,project_id,user_id,url,mode) select
 ('20000000-0000-4000-8000-' || right(id::text,12))::uuid,id,user_id,url,'quick' from public.projects;
insert into public.issues(audit_id,data) select id,'{"title":"Test evidence"}' from public.audits;
insert into public.audit_pages(audit_id,url,evidence) select id,url,'{}' from public.audits;
insert into public.screenshots(audit_id,path,url,viewport) select id,user_id||'/'||id||'/test.png',url,'{}' from public.audits;
insert into public.agent_runs(audit_id,agent,message,status) select id,'browser','Captured','complete' from public.audits;
insert into public.mission_steps(audit_id,tool,args,result) select id,'getPageText','{}','{}' from public.audits;
insert into storage.objects(bucket_id,name) select 'screenshots',path from public.screenshots;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
do $$ declare t text; n int; begin
 foreach t in array array['projects','audits','issues','audit_pages','screenshots','agent_runs','mission_steps'] loop
  execute format('select count(*) from public.%I',t) into n;
  if n<>1 then raise exception 'Owner isolation failed: % count %',t,n; end if;
 end loop;
 if (select count(*) from storage.objects)<>1 then raise exception 'Private screenshot isolation failed'; end if;
 update public.issues set status='resolved';
 if (select count(*) from public.issues where status='resolved')<>1 then raise exception 'Issue status update failed'; end if;
 begin
  update public.issues set data='{}';
  raise exception 'Issue evidence was writable';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.audits(project_id,user_id,url,mode) values('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','https://example.org','quick');
  raise exception 'Cross-user audit creation allowed';
 exception when insufficient_privilege then null; end;
 begin
  update public.projects set user_id='00000000-0000-4000-8000-000000000002';
  raise exception 'Ownership reassignment allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform public.claim_audit();
  raise exception 'Authenticated user could claim jobs';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$ begin
 if (select count(*) from public.projects)<>1 or (select name from public.projects)<>'Bob' then raise exception 'Second user isolation failed'; end if;
 if (select count(*) from public.issues where status='resolved')<>0 then raise exception 'Cross-user issue update occurred'; end if;
end $$;
set local role anon;
do $$ begin
 begin
  perform * from public.projects;
  raise exception 'Anonymous access allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform public.claim_audit();
  raise exception 'Anonymous queue access allowed';
 exception when insufficient_privilege then null; end;
end $$;
set local role service_role;
do $$ declare first_id uuid; second_id uuid; begin
 select id into first_id from public.claim_audit();
 select id into second_id from public.claim_audit();
 if first_id is null or second_id is null or first_id=second_id then raise exception 'Queue claim failed'; end if;
 if exists(select 1 from public.claim_audit()) then raise exception 'Job was claimed twice'; end if;
 update public.audits set heartbeat_at=now()-interval '4 minutes' where id=first_id;
 perform public.expire_audits();
 if (select status from public.audits where id=first_id)<>'failed' then raise exception 'Expired lease was not failed'; end if;
 if (select status from public.audits where id=second_id)<>'running' then raise exception 'Live lease was expired'; end if;
end $$;
rollback;
select 'PASS: migration, seven-table owner isolation, private storage, column grants, queue claims and expiry' as result;
