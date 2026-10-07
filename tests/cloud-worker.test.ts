import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  create: vi.fn(),
  admin: vi.fn(),
  generateContent: vi.fn(),
  interaction: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({ readFile: mocks.readFile }));
vi.mock("@vercel/sandbox", () => ({ Sandbox: { create: mocks.create } }));
vi.mock("../src/lib/supabase/admin", () => ({ adminDb: mocks.admin }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: mocks.generateContent };
    interactions = { create: mocks.interaction };
  },
}));
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
  vi.stubEnv("GEMINI_MODEL", "gemini-3.8-flash");
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
  const mkDir = vi.fn().mockRejectedValue(new Error("File exists"));
  mocks.readFile.mockResolvedValue(Buffer.from("worker"));
  mocks.create.mockResolvedValue({
    mkDir,
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
    cmd: "mkdir",
    args: ["-p", "/vercel/siteforge/.audit-worker"],
  });
  expect(mkDir).not.toHaveBeenCalled();
  expect(runCommand.mock.calls[2][0]).toMatchObject({
    cmd: "node",
    detached: true,
    env: {
      WORKER_AUDIT_ID: "audit-one",
      NODE_ENV: "production",
      AUDIT_EGRESS_ISOLATED: "true",
      GEMINI_MODEL: "gemini-3.8-flash",
    },
  });
  expect(mocks.create.mock.calls[0][0].persistent).toBe(false);
});

it("does not launch a credential-bearing worker if its directory cannot be prepared", async () => {
  const updates = queue(true);
  const runCommand = vi
    .fn()
    .mockResolvedValueOnce({ exitCode: 0 })
    .mockResolvedValueOnce({ exitCode: 1 });
  mocks.readFile.mockResolvedValue(Buffer.from("worker"));
  const stop = vi.fn().mockResolvedValue(undefined);
  mocks.create.mockResolvedValue({ runCommand, stop, writeFiles: vi.fn() });
  vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(dispatchQueuedAudit("audit-one")).rejects.toThrow(
    "could not start",
  );
  expect(runCommand).toHaveBeenCalledTimes(2);
  expect(stop).toHaveBeenCalled();
  expect(updates.at(-1)).toMatchObject({ status: "failed" });
  vi.restoreAllMocks();
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

it("requires authentication before running a billable AI connection test", async () => {
  const response = await POST(
    new Request("https://example.com/api/worker", {
      method: "POST",
      body: JSON.stringify({ action: "verify-ai" }),
    }),
  );
  expect(response.status).toBe(401);
  expect(mocks.interaction).not.toHaveBeenCalled();
});

it("verifies structured output using the available default model without creating an audit", async () => {
  vi.stubEnv("GEMINI_MODEL", "");
  mocks.interaction.mockResolvedValue({
    output_text: '{"issues":[],"summary":"Connection successful"}',
  });
  const response = await POST(
    new Request("https://example.com/api/worker", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.WORKER_DISPATCH_SECRET}`,
      },
      body: JSON.stringify({ action: "verify-ai" }),
    }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    ready: true,
    model: "gemini-3.8-flash",
  });
  expect(mocks.interaction).toHaveBeenCalledWith(
    expect.objectContaining({
      model: "gemini-3.8-flash",
      store: false,
      response_format: expect.objectContaining({
        mime_type: "application/json",
      }),
    }),
  );
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});

it("does not expose provider errors or credentials in a failed connection response", async () => {
  mocks.interaction.mockRejectedValue(new Error("provider private-api-key"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await POST(
    new Request("https://example.com/api/worker", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.WORKER_DISPATCH_SECRET}`,
      },
      body: JSON.stringify({ action: "verify-ai" }),
    }),
  );
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain("private-api-key");
  log.mockRestore();
});

it("refreshes a template without exposing database or AI credentials", async () => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  const snapshot = vi.fn().mockResolvedValue({ snapshotId: "fresh-template" });
  mocks.create.mockResolvedValue({ snapshot });
  const response = await POST(
    new Request("https://example.com/api/worker", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.WORKER_DISPATCH_SECRET}`,
      },
      body: JSON.stringify({ action: "refresh-snapshot" }),
    }),
  );
  expect(response.status).toBe(200);
  expect(mocks.create.mock.calls[0][0].env).toBeUndefined();
  expect(mocks.create.mock.calls[0][0].networkPolicy).toBe("deny-all");
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(snapshot).toHaveBeenCalledWith({ expiration: 0 });
});
