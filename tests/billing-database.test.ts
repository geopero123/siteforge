import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, it, expect } from "vitest";

let db: PGlite;
const owner = "11111111-1111-1111-1111-111111111111";
const other = "22222222-2222-2222-2222-222222222222";
const project = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
async function balance(kind: string) {
  return (
    await db.query<{ remaining: number }>(
      "select remaining from public.test_credits where user_id=$1 and kind=$2 order by created_at",
      [owner, kind],
    )
  ).rows[0]?.remaining;
}
async function audit() {
  return (
    await db.query<{ id: string }>(
      "insert into public.audits(project_id,user_id,url,mode) values($1,$2,'https://example.com','quick') returning id",
      [project, owner],
    )
  ).rows[0].id;
}
beforeAll(async () => {
  db = new PGlite();
  for (const file of [
    "scripts/database-bootstrap.sql",
    "supabase/migrations/20261004084108_initial_siteforge.sql",
    "supabase/migrations/20261004162058_test_billing.sql",
  ]) {
    await db.exec(await readFile(file, "utf8"));
  }
  await db.query("insert into auth.users(id) values($1),($2)", [owner, other]);
  await db.query(
    "insert into public.projects(id,user_id,name,url) values($1,$2,'Website','https://example.com')",
    [project, owner],
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});

it("serializes checkout creation and only releases the matching reservation", async () => {
  await db.query(
    "insert into public.billing_customers(user_id,stripe_customer_id) values($1,'cus_owner')",
    [owner],
  );
  const token = crypto.randomUUID(),
    next = crypto.randomUUID();
  await db.exec("set role service_role;");
  expect(
    (
      await db.query<{ locked: boolean }>(
        "select public.lock_test_checkout($1,$2) as locked",
        [owner, token],
      )
    ).rows[0].locked,
  ).toBe(true);
  expect(
    (
      await db.query<{ locked: boolean }>(
        "select public.lock_test_checkout($1,$2) as locked",
        [owner, next],
      )
    ).rows[0].locked,
  ).toBe(false);
  await db.query("select public.unlock_test_checkout($1,$2)", [owner, next]);
  expect(
    (
      await db.query<{ locked: boolean }>(
        "select public.lock_test_checkout($1,$2) as locked",
        [owner, next],
      )
    ).rows[0].locked,
  ).toBe(false);
  await db.query("select public.unlock_test_checkout($1,$2)", [owner, token]);
  expect(
    (
      await db.query<{ locked: boolean }>(
        "select public.lock_test_checkout($1,$2) as locked",
        [owner, next],
      )
    ).rows[0].locked,
  ).toBe(true);
  await db.query("select public.unlock_test_checkout($1,$2)", [owner, next]);
  await db.exec("reset role;");
});

it("keeps existing audits working until billing is activated", async () => {
  const id = await audit();
  expect(
    (
      await db.query(
        "select * from public.audit_credit_usage where audit_id=$1",
        [id],
      )
    ).rows,
  ).toHaveLength(0);
  await db.exec(
    "update public.audits set status='complete'; update public.billing_settings set enabled=true;",
  );
});
it("blocks an unpaid audit and rolls back its insertion", async () => {
  const before = (await db.query("select id from public.audits")).rows.length;
  await expect(audit()).rejects.toThrow("TEST_CREDITS_REQUIRED");
  expect((await db.query("select id from public.audits")).rows.length).toBe(
    before,
  );
});
it("spends expiring monthly credits first, allows three jobs, and refunds failed jobs exactly once", async () => {
  await db.query(
    "insert into public.test_credits(user_id,source,kind,quantity,remaining) values($1,'single:1','single',1,1)",
    [owner],
  );
  await db.query(
    "insert into public.test_credits(user_id,source,kind,quantity,remaining,expires_at) values($1,'monthly:1','monthly',20,20,now()+interval '1 month')",
    [owner],
  );
  const ids = [await audit(), await audit(), await audit()];
  expect(await balance("monthly")).toBe(17);
  expect(await balance("single")).toBe(1);
  await expect(audit()).rejects.toThrow("AUDIT_QUEUE_FULL");
  expect(await balance("monthly")).toBe(17);
  await db.query("update public.audits set status='failed' where id=$1", [
    ids[0],
  ]);
  expect(await balance("monthly")).toBe(18);
  await db.query("update public.audits set status='running' where id=$1", [
    ids[0],
  ]);
  await db.query("update public.audits set status='failed' where id=$1", [
    ids[0],
  ]);
  expect(await balance("monthly")).toBe(18);
  await db.exec(
    "update public.audits set status='complete' where status='queued';",
  );
});
it("prevents two submissions from spending the last test", async () => {
  await db.exec(
    "update public.test_credits set expires_at=now()-interval '1 second', starts_at=now()-interval '1 month' where kind='monthly';",
  );
  const attempts = await Promise.allSettled([audit(), audit()]);
  expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(await balance("single")).toBe(0);
  await db.exec(
    "update public.audits set status='complete' where status='queued';",
  );
});
it("does not allow duplicate payment delivery to replenish spent credits", async () => {
  await db.query(
    "insert into public.test_credits(user_id,source,kind,quantity,remaining) values($1,'single:1','single',1,1) on conflict(source) do nothing",
    [owner],
  );
  expect(await balance("single")).toBe(0);
});
it("honors a refund that arrives before payment fulfillment", async () => {
  await db.exec(
    "set role service_role; select public.revoke_test_payment('pi_refunded'); reset role;",
  );
  await db.query(
    "insert into public.test_credits(user_id,source,kind,quantity,remaining,payment_intent_id) values($1,'single:refunded','single',1,1,'pi_refunded')",
    [owner],
  );
  expect(
    (
      await db.query<{ revoked: boolean }>(
        "select revoked from public.test_credits where source='single:refunded'",
      )
    ).rows[0].revoked,
  ).toBe(true);
  await expect(audit()).rejects.toThrow("TEST_CREDITS_REQUIRED");
});
it("revokes unused credits for a refunded payment", async () => {
  await db.query(
    "insert into public.test_credits(user_id,source,kind,quantity,remaining,payment_intent_id) values($1,'single:refund-later','single',1,1,'pi_later')",
    [owner],
  );
  await db.exec(
    "set role service_role; select public.revoke_test_payment('pi_later'); reset role;",
  );
  await expect(audit()).rejects.toThrow("TEST_CREDITS_REQUIRED");
});
it("isolates billing rows and denies client grants, activation and refunds", async () => {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    other,
  ]);
  await db.exec("set role authenticated;");
  expect(
    (await db.query("select * from public.test_credits")).rows,
  ).toHaveLength(0);
  await expect(
    db.query(
      "insert into public.test_credits(user_id,source,kind,quantity,remaining) values($1,'forged','single',1,1)",
      [other],
    ),
  ).rejects.toThrow(/permission denied/);
  await expect(
    db.exec("update public.billing_settings set enabled=false"),
  ).rejects.toThrow(/permission denied/);
  await expect(
    db.exec("select public.revoke_test_payment('fake')"),
  ).rejects.toThrow(/permission denied/);
  await db.exec("reset role;");
  await db.query("select set_config('request.jwt.claim.sub','',false)");
});
it("enforces payment rules through direct authenticated database inserts", async () => {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    owner,
  ]);
  await db.exec("set role authenticated;");
  await expect(audit()).rejects.toThrow("TEST_CREDITS_REQUIRED");
  await db.exec("reset role;");
});
