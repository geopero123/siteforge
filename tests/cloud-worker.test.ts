import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  create: vi.fn(),
  admin: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({ readFile: mocks.readFile }));
vi.mock("@vercel/sandbox", () => ({ Sandbox: { create: mocks.create } }));
vi.mock("../src/lib/supabase/admin", () => ({ adminDb: mocks.admin }));
import {
  dispatchQueuedAudit,
  workerConfigurationError,
} from "../src/lib/audit/cloud-worker";
import { POST } from "../src/app/api/worker/route";

beforeEach(() => {
  vi.resetAllMocks();
  for (const key of [
    "VERCEL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GEMINI_API_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "AUDIT_WORKER_SNAPSHOT_ID",
    "WORKER_DISPATCH_SECRET",
  ])
    vi.stubEnv(key, key === "VERCEL" ? "1" : `private-${key}`);
  vi.stubEnv("AUDIT_WORKER_MODE", "");
});
afterEach(() => vi.unstubAllEnvs());

function queue(reserved: boolean) {
  const updates: Array<Record<string, unknown>> = [];
  mocks.admin.mockReturnValue({
    from: () => {
      let update = false;
      const builder = {
        update: (values: Record<string, unknown>) => {
          updates.push(values);
          update = true;
          return builder;
        },
        eq: () => builder,
        is: () => builder,
        maybeSingle: async () => ({
          data: {
            id: "audit-one",
            status: "queued",
            started_at: null,
            mode: "quick",
          },
          error: null,
        }),
        select: () =>
          update
            ? Promise.resolve({
                data: reserved ? [{ id: "audit-one" }] : [],
                error: null,
              })
            : builder,
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ error: null }).then(resolve),
      };
      return builder;
    },
  });
  return updates;
}

it("reports missing worker credentials and supports a separate worker", () => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  expect(workerConfigurationError()).toContain("SUPABASE_SERVICE_ROLE_KEY");
  vi.stubEnv("AUDIT_WORKER_MODE", "external");
  expect(workerConfigurationError()).toBeNull();
});

it("does not launch another VM when a concurrent request wins startup", async () => {
  queue(false);
  expect(await dispatchQueuedAudit("audit-one")).toBe(false);
  expect(mocks.create).not.toHaveBeenCalled();
});

it("isolates networking before injecting credentials and starts only the reserved audit", async () => {
  queue(true);
  const runCommand = vi.fn().mockResolvedValue({ exitCode: 0 });
  mocks.readFile.mockResolvedValue(Buffer.from("worker"));
  mocks.create.mockResolvedValue({
    mkDir: vi.fn(),
    writeFiles: vi.fn(),
    runCommand,
  });
  expect(await dispatchQueuedAudit("audit-one")).toBe(true);
  expect(runCommand.mock.calls[0][0]).toMatchObject({
    cmd: "bash",
    sudo: true,
  });
  expect(runCommand.mock.calls[0][0].env).toBeUndefined();
  expect(runCommand.mock.calls[1][0]).toMatchObject({
    cmd: "node",
    detached: true,
    env: {
      WORKER_AUDIT_ID: "audit-one",
      NODE_ENV: "production",
      AUDIT_EGRESS_ISOLATED: "true",
    },
  });
  expect(mocks.create.mock.calls[0][0].persistent).toBe(false);
});

it("records a visible failure if cloud startup fails", async () => {
  const updates = queue(true);
  mocks.readFile.mockRejectedValue(new Error("worker bundle missing"));
  vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(dispatchQueuedAudit("audit-one")).rejects.toThrow(
    "could not start",
  );
  expect(updates.at(-1)).toMatchObject({
    status: "failed",
    error: expect.stringContaining("could not start"),
  });
  vi.restoreAllMocks();
});

it("rejects an unauthorized recovery request before touching the database", async () => {
  const response = await POST(
    new Request("https://example.com/api/worker", { method: "POST" }),
  );
  expect(response.status).toBe(401);
  expect(mocks.admin).not.toHaveBeenCalled();
});
