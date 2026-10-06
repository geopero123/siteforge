import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, it, expect } from "vitest";

let db: PGlite;
const owner = "11111111-1111-1111-1111-111111111111";
const project = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
beforeAll(async () => {
  db = new PGlite();
  for (const file of [
    "scripts/database-bootstrap.sql",
    "supabase/migrations/20261004084108_initial_siteforge.sql",
    "supabase/migrations/20261004162058_test_billing.sql",
    "supabase/migrations/20261006090000_repository_audits.sql",
  ])
    await db.exec(await readFile(file, "utf8"));
  await db.query("insert into auth.users(id) values($1)", [owner]);
}, 30000);
afterAll(async () => {
  await db?.close();
});

it("allows repository-only projects but not empty ones", async () => {
  await db.query(
    "insert into public.projects(id,user_id,name,repository) values($1,$2,'Code','acme/app')",
    [project, owner],
  );
  await expect(
    db.query("insert into public.projects(user_id,name) values($1,'Empty')", [
      owner,
    ]),
  ).rejects.toThrow("projects_target_check");
});

it("requires the target that matches the audit mode", async () => {
  await db.query(
    "insert into public.audits(project_id,user_id,mode,repository) values($1,$2,'repository','acme/app')",
    [project, owner],
  );
  await db.query(
    "insert into public.audits(project_id,user_id,mode,url,repository) values($1,$2,'quick','https://example.com','acme/app')",
    [project, owner],
  );
  await expect(
    db.query(
      "insert into public.audits(project_id,user_id,mode) values($1,$2,'repository')",
      [project, owner],
    ),
  ).rejects.toThrow("audits_target_check");
  await expect(
    db.query(
      "insert into public.audits(project_id,user_id,mode,repository) values($1,$2,'full','acme/app')",
      [project, owner],
    ),
  ).rejects.toThrow("audits_target_check");
  await expect(
    db.query(
      "insert into public.audits(project_id,user_id,mode,url) values($1,$2,'unknown','https://example.com')",
      [project, owner],
    ),
  ).rejects.toThrow("audits_mode_check");
});
