import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";

let db: PGlite;
const owner = "11111111-1111-1111-1111-111111111111";
const other = "22222222-2222-2222-2222-222222222222";
const project = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

beforeAll(async () => {
  db = new PGlite();
  for (const file of [
    "scripts/database-bootstrap.sql",
    "supabase/migrations/20261004084108_initial_siteforge.sql",
    "supabase/migrations/20261004162058_test_billing.sql",
    "supabase/migrations/20261006090000_repository_audits.sql",
    "supabase/migrations/20261006120000_audit_rate_limits.sql",
  ])
    await db.exec(await readFile(file, "utf8"));
  await db.query("insert into auth.users(id) values($1),($2)", [owner, other]);
  await db.query(
    "insert into public.projects(id,user_id,name,url) values($1,$2,'Site','https://example.com')",
    [project, owner],
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec("reset role; delete from public.audits;");
});

// Inserts the way the web app does: as the signed-in user, under RLS.
async function queueAs(user: string, extra = "") {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("set role authenticated;");
  try {
    await db.query(
      `insert into public.audits(project_id,user_id,url,mode${extra ? ",created_at" : ""}) values($1,$2,'https://example.com','quick'${extra ? "," + extra : ""})`,
      [project, user],
    );
  } finally {
    await db.exec("reset role;");
    await db.query("select set_config('request.jwt.claim.sub','',false)");
  }
}
const finishAll = () =>
  db.exec("update public.audits set status='failed' where status='queued';");

it("caps pending audits at three while billing is off", async () => {
  for (let i = 0; i < 3; i++) await queueAs(owner);
  await expect(queueAs(owner)).rejects.toThrow("AUDIT_QUEUE_FULL");
});

it("caps each account at ten audits an hour, failed ones included", async () => {
  for (let i = 0; i < 10; i++) {
    await queueAs(owner);
    await finishAll();
  }
  await expect(queueAs(owner)).rejects.toThrow("AUDIT_RATE_LIMITED");
  // Audits older than an hour stop counting.
  await db.exec(
    "update public.audits set created_at = now() - interval '2 hours';",
  );
  await expect(queueAs(owner)).resolves.toBeUndefined();
});

it("stamps audits with server time so they cannot be back-dated", async () => {
  await queueAs(owner, "'2020-01-01T00:00:00Z'");
  const { rows } = await db.query<{ recent: boolean }>(
    "select created_at > now() - interval '1 minute' as recent from public.audits",
  );
  expect(rows).toEqual([{ recent: true }]);
});

it("rejects audits queued for another account", async () => {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    other,
  ]);
  await db.exec("set role authenticated;");
  await expect(
    db.query(
      "insert into public.audits(project_id,user_id,url,mode) values($1,$2,'https://example.com','quick')",
      [project, owner],
    ),
  ).rejects.toThrow("UNAUTHORIZED");
  await db.exec("reset role;");
  await db.query("select set_config('request.jwt.claim.sub','',false)");
});

it("does not limit the service role", async () => {
  for (let i = 0; i < 12; i++)
    await db.query(
      "insert into public.audits(project_id,user_id,url,mode) values($1,$2,'https://example.com','quick')",
      [project, owner],
    );
  const { rows } = await db.query<{ n: number }>(
    "select count(*)::int as n from public.audits",
  );
  expect(rows[0].n).toBe(12);
});
