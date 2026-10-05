import { it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/supabase/server", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/security/url", () => ({
  validateTarget: vi.fn(),
  parseTarget: vi.fn(),
}));
import { requireUser } from "@/lib/supabase/server";
import { POST as auditPost } from "../src/app/api/audits/route";
import { POST as projectPost } from "../src/app/api/projects/route";
import { PATCH } from "../src/app/api/issues/[id]/route";
import { GET } from "../src/app/api/audits/[id]/route";
import { POST as checkoutPost } from "../src/app/api/billing/checkout/route";
import { POST as portalPost } from "../src/app/api/billing/portal/route";
beforeEach(() => vi.resetAllMocks());
function request(body: unknown) {
  return new Request("https://siteforge.example/api/audits", {
    method: "POST",
    headers: {
      origin: "https://siteforge.example",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
it("rejects unauthenticated audit creation", async () => {
  vi.mocked(requireUser).mockRejectedValue(new Error("UNAUTHORIZED"));
  expect((await auditPost(request({}))).status).toBe(401);
});
it("requires sign-in before checkout or billing portal access", async () => {
  vi.mocked(requireUser).mockRejectedValue(new Error("UNAUTHORIZED"));
  expect((await checkoutPost(request({ plan: "single" }))).status).toBe(401);
  expect((await portalPost(request({}))).status).toBe(401);
});
it("rejects checkout and portal mutations from another origin", async () => {
  for (const handler of [checkoutPost, portalPost]) {
    expect(
      (
        await handler(
          new Request("https://siteforge.example/api/billing/checkout", {
            method: "POST",
            headers: { origin: "https://evil.example" },
          }),
        )
      ).status,
    ).toBeGreaterThanOrEqual(400);
  }
  expect(requireUser).not.toHaveBeenCalled();
});
it("returns payment-required when database credit enforcement rejects an audit", async () => {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    insert: vi.fn(),
    in: vi.fn(async () => ({ count: 0, error: null })),
    single: vi.fn(async () => ({
      data: null,
      error: { message: "TEST_CREDITS_REQUIRED" },
    })),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.insert.mockReturnValue(chain);
  vi.mocked(requireUser).mockResolvedValue({
    db: { from: vi.fn(() => chain) },
    user: { id: "owner" },
  } as never);
  const response = await auditPost(
    request({
      projectId: crypto.randomUUID(),
      url: "https://example.com",
      mode: "quick",
    }),
  );
  expect(response.status).toBe(402);
  expect((await response.json()).code).toBe("TEST_CREDITS_REQUIRED");
});
it("rejects unauthenticated project creation", async () => {
  vi.mocked(requireUser).mockRejectedValue(new Error("UNAUTHORIZED"));
  expect((await projectPost(request({}))).status).toBe(401);
});
it("rejects unauthenticated issue mutation", async () => {
  vi.mocked(requireUser).mockRejectedValue(new Error("UNAUTHORIZED"));
  expect(
    (
      await PATCH(request({ status: "resolved" }), {
        params: Promise.resolve({ id: "test" }),
      })
    ).status,
  ).toBe(401);
});
it("rejects unauthenticated audit retrieval", async () => {
  vi.mocked(requireUser).mockRejectedValue(new Error("UNAUTHORIZED"));
  expect(
    (await GET(request({}), { params: Promise.resolve({ id: "test" }) }))
      .status,
  ).toBe(401);
});
it("rejects malformed audit input before writes", async () => {
  vi.mocked(requireUser).mockResolvedValue({
    db: {},
    user: { id: "owner" },
  } as never);
  expect((await auditPost(request({ url: "not-url" }))).status).toBe(400);
});
it("rejects cross-origin mutations", async () => {
  const r = new Request("https://siteforge.example/api/audits", {
    method: "POST",
    headers: { origin: "https://evil.example" },
  });
  const response = await auditPost(r);
  expect(response.status).toBeGreaterThanOrEqual(400);
  expect(requireUser).not.toHaveBeenCalled();
});
it("fails closed when the audit queue count cannot be read", async () => {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(async () => ({
      count: null,
      error: { message: "Database unavailable" },
    })),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  const from = vi.fn(() => chain);
  vi.mocked(requireUser).mockResolvedValue({
    db: { from },
    user: { id: "owner" },
  } as never);
  const response = await auditPost(
    request({
      projectId: crypto.randomUUID(),
      url: "https://example.com",
      mode: "quick",
    }),
  );
  expect(response.status).toBe(500);
  expect(from).toHaveBeenCalledTimes(1);
  expect((await response.json()).error).toContain(
    "Unable to check the audit queue",
  );
});
it("rejects a fourth pending audit before insertion", async () => {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(async () => ({ count: 3, error: null })),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  const from = vi.fn(() => chain);
  vi.mocked(requireUser).mockResolvedValue({
    db: { from },
    user: { id: "owner" },
  } as never);
  expect(
    (
      await auditPost(
        request({
          projectId: crypto.randomUUID(),
          url: "https://example.com",
          mode: "quick",
        }),
      )
    ).status,
  ).toBe(429);
  expect(from).toHaveBeenCalledTimes(1);
});
