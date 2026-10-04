import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isPublicAddress,
  parseTarget,
  validateTarget,
  ToolBudget,
} from "../src/lib/security/url";
import {
  score,
  deduplicate,
  findingSchema,
  auditInputSchema,
  type Finding,
} from "../src/lib/audit/schema";
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));
import { lookup } from "node:dns/promises";
const finding: Finding = {
  title: "Runtime exception",
  category: "reliability",
  severity: "high",
  confidence: 1,
  url: "https://example.com/",
  viewport: null,
  description: "Observed error",
  evidence: [{ type: "console", detail: "TypeError" }],
  reproductionSteps: ["Load page"],
  suggestedFix: "Fix handler",
  sourceFiles: [],
};
afterEach(() => vi.restoreAllMocks());
describe("SSRF security", () => {
  for (const url of [
    "http://localhost",
    "http://127.0.0.1",
    "http://2130706433",
    "http://0x7f000001",
    "http://10.1.2.3",
    "http://169.254.169.254",
    "http://[::1]",
    "http://[::ffff:127.0.0.1]",
    "ftp://example.com",
    "https://user:pass@example.com",
    "http://example.com:3000",
    "http://site.internal",
  ])
    it(`blocks ${url}`, () => expect(() => parseTarget(url)).toThrow());
  it("accepts public HTTPS", () =>
    expect(parseTarget("https://example.com").origin).toBe(
      "https://example.com",
    ));
  it("rejects private DNS resolution", async () => {
    vi.mocked(lookup).mockResolvedValueOnce([
      { address: "192.168.1.1", family: 4 },
    ] as never);
    await expect(validateTarget("https://example.com")).rejects.toThrow(
      "blocked",
    );
  });
  it("rejects mixed public/private DNS records", async () => {
    vi.mocked(lookup).mockResolvedValueOnce([
      { address: "93.184.216.34", family: 4 },
      { address: "::1", family: 6 },
    ] as never);
    await expect(validateTarget("https://example.com")).rejects.toThrow();
  });
  it("classifies reserved IPv4 and IPv6", () => {
    for (const ip of [
      "0.0.0.0",
      "100.64.0.1",
      "224.0.0.1",
      "fe80::1",
      "fc00::1",
    ])
      expect(isPublicAddress(ip)).toBe(false);
    expect(isPublicAddress("8.8.8.8")).toBe(true);
  });
});
describe("report scoring", () => {
  it("applies documented severity weights", () =>
    expect(score([finding]).categories.reliability).toBe(85));
  it("uses confidence and clamps scores", () => {
    expect(
      score([{ ...finding, confidence: 0.5 }]).categories.reliability,
    ).toBe(93);
    expect(
      score(Array.from({ length: 20 }, () => finding)).categories.reliability,
    ).toBe(0);
  });
  it("excludes resolved and ignored findings", () =>
    expect(score([{ ...finding, status: "resolved" }]).overall).toBe(100));
  it("deduplicates repeated objective findings across viewports", () =>
    expect(
      deduplicate([
        finding,
        { ...finding, viewport: { width: 390, height: 844 } },
      ]),
    ).toHaveLength(1));
  it("preserves separate responsive viewport failures", () =>
    expect(
      deduplicate([
        {
          ...finding,
          category: "responsive",
          viewport: { width: 390, height: 844 },
        },
        {
          ...finding,
          category: "responsive",
          viewport: { width: 768, height: 1024 },
        },
      ]),
    ).toHaveLength(2));
  it("retains strongest evidence confidence", () =>
    expect(
      deduplicate([{ ...finding, confidence: 0.5 }, finding])[0].confidence,
    ).toBe(1));
  it("merges distinct viewport evidence without mutating input", () => {
    const mobile = {
      ...finding,
      evidence: [
        {
          type: "screenshot" as const,
          detail: "Mobile",
          reference: "mobile.png",
        },
      ],
    };
    const result = deduplicate([finding, mobile]);
    expect(result[0].evidence).toHaveLength(2);
    expect(finding.evidence).toHaveLength(1);
  });
});
describe("structured output", () => {
  it("requires evidence and bounded confidence", () => {
    expect(findingSchema.safeParse({ ...finding, evidence: [] }).success).toBe(
      false,
    );
    expect(findingSchema.safeParse({ ...finding, confidence: 2 }).success).toBe(
      false,
    );
  });
  it("requires a mission objective", () =>
    expect(
      auditInputSchema.safeParse({
        projectId: crypto.randomUUID(),
        url: "https://example.com",
        mode: "mission",
      }).success,
    ).toBe(false));
});
describe("tool limits", () => {
  it("enforces step ceiling", () => {
    const b = new ToolBudget(1);
    b.consume("read", {});
    expect(() => b.consume("other", {})).toThrow("limit");
  });
  it("detects action loops", () => {
    const b = new ToolBudget();
    for (let i = 0; i < 3; i++) b.consume("click", { id: "el_1" });
    expect(() => b.consume("click", { id: "el_1" })).toThrow("loop");
  });
  it("bounds all navigation including back", () => {
    const b = new ToolBudget(20, 1);
    b.consume("navigateTo", { url: "/" });
    expect(() => b.consume("goBack", {})).toThrow("Navigation");
  });
  it("enforces elapsed time", () => {
    vi.useFakeTimers();
    const b = new ToolBudget(20, 6, 1000);
    vi.advanceTimersByTime(1001);
    expect(() => b.consume("read", {})).toThrow("time");
    vi.useRealTimers();
  });
});
