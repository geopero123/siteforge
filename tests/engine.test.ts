import { describe, it, expect, vi, afterEach } from "vitest";
import { gzipSync } from "node:zlib";
import {
  runAudit,
  selectAuditPages,
  auditTimeout,
} from "../src/lib/audit/engine";
import { headerFindings } from "../src/lib/audit/deterministic";
import {
  auditInputSchema,
  score,
  scoreScope,
  type Finding,
} from "../src/lib/audit/schema";
import { BudgetedProvider, type AIProvider } from "../src/lib/ai/provider";

afterEach(() => vi.unstubAllGlobals());

describe("page selection", () => {
  const origin = "https://shop.example";
  it("spreads pages across site sections and skips files and logout links", () => {
    const pages = selectAuditPages(
      origin + "/",
      [
        origin + "/",
        origin + "/blog/one",
        origin + "/blog/two",
        origin + "/blog/three",
        origin + "/account/logout",
        origin + "/brochure.pdf",
        "https://other.example/pricing",
      ],
      [origin + "/pricing", origin + "/docs/start", origin + "/blog/one/"],
      origin,
      "full",
    );
    expect(pages).toEqual([
      origin + "/",
      origin + "/blog/one",
      origin + "/pricing",
      origin + "/docs/start",
      origin + "/blog/two",
    ]);
  });
  it("keeps quick scans to one extra page and missions to the homepage", () => {
    const links = [origin + "/a", origin + "/b"];
    expect(
      selectAuditPages(origin + "/", links, [], origin, "quick"),
    ).toHaveLength(2);
    expect(
      selectAuditPages(origin + "/", links, [], origin, "mission"),
    ).toHaveLength(1);
  });
});

describe("security header checks", () => {
  it("reports missing protections, weak cookies and mixed content", () => {
    const titles = headerFindings(
      "https://example.com/",
      { server: "nginx/1.18.0" },
      [{ name: "sid", secure: false, httpOnly: false, sameSite: "Lax" }],
      ["http://cdn.example.com/app.js"],
    ).map((f) => f.title);
    expect(titles).toEqual(
      expect.arrayContaining([
        "Missing strict-transport-security header",
        "Missing content-security-policy header",
        "Missing x-content-type-options header",
        "Page can be embedded by other sites (clickjacking)",
        "Server discloses software versions",
        "Cookies are missing security attributes",
        "Page loads resources over insecure HTTP (mixed content)",
      ]),
    );
  });
  it("is quiet for a hardened response", () =>
    expect(
      headerFindings(
        "https://example.com/",
        {
          "strict-transport-security": "max-age=31536000",
          "content-security-policy":
            "default-src 'self'; frame-ancestors 'none'",
          "x-content-type-options": "nosniff",
        },
        [{ name: "sid", secure: true, httpOnly: true, sameSite: "Lax" }],
        [],
      ),
    ).toEqual([]));
});

describe("audit input and scoring", () => {
  const projectId = crypto.randomUUID();
  it("accepts repository-only audits and normalizes GitHub links", () => {
    expect(
      auditInputSchema.parse({
        projectId,
        mode: "repository",
        repository: "https://github.com/acme/app",
      }).repository,
    ).toBe("acme/app");
  });
  it("requires the target that the mode needs", () => {
    expect(() =>
      auditInputSchema.parse({ projectId, mode: "repository" }),
    ).toThrow("repository");
    expect(() =>
      auditInputSchema.parse({ projectId, mode: "quick", repository: "a/b" }),
    ).toThrow("website URL");
  });
  it("scores only the categories an audit can observe", () => {
    const issue: Finding = {
      title: "Leaked key",
      category: "security",
      severity: "critical",
      confidence: 1,
      url: "https://github.com/a/b",
      viewport: null,
      description: "",
      evidence: [{ type: "source", detail: "x" }],
      reproductionSteps: [],
      suggestedFix: "",
      sourceFiles: [],
    };
    const repoScope = scoreScope(false, true);
    expect(repoScope).toEqual([
      "reliability",
      "security",
      "code",
      "dependencies",
    ]);
    expect(score([issue], repoScope)).toEqual({
      overall: 93,
      categories: {
        reliability: 100,
        security: 70,
        code: 100,
        dependencies: 100,
      },
    });
    expect(
      Object.keys(score([], scoreScope(true, true)).categories),
    ).toHaveLength(9);
  });
  it("gives combined audits extra time for the code stage", () => {
    expect(auditTimeout("quick", false)).toBe(300000);
    expect(auditTimeout("quick", true)).toBe(600000);
    expect(auditTimeout("repository", true)).toBe(600000);
  });
});

describe("AI budget", () => {
  it("stops calling the model after the per-audit limit", async () => {
    const inner = {
      generate: vi.fn(async () => "ok"),
    } as unknown as AIProvider;
    const ai = new BudgetedProvider(inner, 2);
    await ai.generate("a");
    await ai.generate("b");
    expect(() => ai.generate("c")).toThrow("budget");
    expect(inner.generate).toHaveBeenCalledTimes(2);
  });
});

describe("repository-only audit", () => {
  function tarEntry(path: string, body: string) {
    const header = Buffer.alloc(512);
    header.write(path, 0);
    header.write(body.length.toString(8).padStart(11, "0") + "\0", 124);
    header.write("0", 156);
    const data = Buffer.alloc(Math.ceil(body.length / 512) * 512);
    data.write(body);
    return Buffer.concat([header, data]);
  }
  it("runs without a browser and reports source findings", async () => {
    const archive = gzipSync(
      Buffer.concat([
        tarEntry(
          "r/src/api.ts",
          "db.query(`SELECT * FROM t WHERE id=${id}`);\n",
        ),
        Buffer.alloc(1024),
      ]),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/repos/acme/app"))
          return Response.json({ default_branch: "main" });
        if (url.includes("/commits/")) return Response.json({ sha: "f00d" });
        if (url.includes("/tarball/")) return new Response(archive);
        return new Response("", { status: 404 });
      }),
    );
    const ai = {
      generate: async () => "",
      generateStructured: async () => ({
        summary: "One injection risk.",
        issues: [],
      }),
      analyzeImage: async () => {
        throw new Error("no browser expected");
      },
      callTools: async () => {
        throw new Error("no browser expected");
      },
    } as AIProvider;
    const noop = async () => {};
    const result = await runAudit({
      mode: "repository",
      repository: "acme/app",
      ai,
      event: noop,
      page: noop,
      step: noop,
      screenshot: async () => {
        throw new Error("no screenshots expected");
      },
    });
    expect(result.repository).toMatchObject({
      name: "acme/app",
      commit: "f00d",
    });
    expect(result.issues.some((i) => i.title.startsWith("SQL query"))).toBe(
      true,
    );
    expect(Object.keys(result.score.categories)).toEqual([
      "reliability",
      "security",
      "code",
      "dependencies",
    ]);
    expect(result.checks.lighthouse).toBeUndefined();
    expect(result.summary).toBe("One injection risk.");
  });
  it("fails clearly when the repository cannot be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 })),
    );
    const noop = async () => {};
    await expect(
      runAudit({
        mode: "repository",
        repository: "acme/missing",
        ai: {} as AIProvider,
        event: noop,
        page: noop,
        step: noop,
        screenshot: async () => "",
      }),
    ).rejects.toThrow("not found");
  });
});
