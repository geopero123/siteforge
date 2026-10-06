-- Audits can target a website, a GitHub repository, or both.
alter table public.projects alter column url drop not null;
alter table public.projects add constraint projects_target_check
  check (url is not null or repository is not null);
alter table public.projects add constraint projects_repository_length
  check (repository is null or length(repository) <= 400);

alter table public.audits alter column url drop not null;
alter table public.audits add column repository text
  check (repository is null or length(repository) <= 400);
alter table public.audits drop constraint audits_mode_check;
alter table public.audits add constraint audits_mode_check
  check (mode in ('quick','full','mission','repository'));
alter table public.audits add constraint audits_target_check
  check (
    (mode = 'repository' and repository is not null)
    or (mode <> 'repository' and url is not null)
  );
