-- Audits can target a website, a GitHub repository, or both.
-- Run as one transaction (supabase db push, or the whole file at once in the
-- SQL editor). If it stops on a lock timeout, nothing changed; run it again.
set local lock_timeout = '5s';

-- Alter audits before projects: an audit insert locks them in that order, so
-- the reverse order could deadlock with a request arriving mid-migration.
alter table public.audits
  alter column url drop not null,
  add column repository text
    check (repository is null or length(repository) <= 400),
  drop constraint audits_mode_check,
  add constraint audits_mode_check
    check (mode in ('quick','full','mission','repository')),
  add constraint audits_target_check check (
    (mode = 'repository' and repository is not null)
    or (mode <> 'repository' and url is not null)
  );

-- projects.repository had no length limit before. A value this long cannot be
-- a GitHub owner/repo, so clear it instead of failing the new constraint.
update public.projects set repository = null where length(repository) > 400;

alter table public.projects
  alter column url drop not null,
  add constraint projects_target_check
    check (url is not null or repository is not null),
  add constraint projects_repository_length
    check (repository is null or length(repository) <= 400);
