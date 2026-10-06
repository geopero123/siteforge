import { describe, it, expect, vi, afterEach } from "vitest";
import { gzipSync } from "node:zlib";
import {
  parseRepository,
  formatRepository,
  repositoryReferenceSchema,
} from "../src/lib/repository/reference";
import { readTar } from "../src/lib/repository/tar";
import { scanConfiguration, scanPatterns } from "../src/lib/repository/rules";
import {
  collectDependencies,
  scanDependencies,
} from "../src/lib/repository/dependencies";
import {
  locateSnippet,
  validatePatch,
  reviewRepository,
} from "../src/lib/repository/review";
import { scanRepository } from "../src/lib/repository/scan";
import { fetchRepositorySnapshot } from "../src/lib/repository/github";
import type { RepositoryFile } from "../src/lib/repository/github";
import type { AIProvider } from "../src/lib/ai/provider";
import { findingSchema } from "../src/lib/audit/schema";

afterEach(() => vi.unstubAllGlobals());

const file = (path: string, text: string): RepositoryFile => ({
  path,
  size: text.length,
  text,
});

function tarEntry(path: string, body: string, type = "0") {
  const header = Buffer.alloc(512);
  header.write(path.slice(0, 100), 0);
  header.write("0000644\0", 100);
  header.write(body.length.toString(8).padStart(11, "0") + "\0", 124);
  header.write(type, 156);
  header.write("ustar\0", 257);
  const data = Buffer.alloc(Math.ceil(body.length / 512) * 512);
  data.write(body);
  return Buffer.concat([header, data]);
}

function fakeAI(
  structured: (prompt: string) => unknown,
): AIProvider & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    prompts,
    generate: async () => "",
    generateStructured: async (prompt: string, schema) => {
      prompts.push(prompt);
      return schema.parse(structured(prompt));
    },
    analyzeImage: async () => {
      throw new Error("unused");
    },
    callTools: async () => {
      throw new Error("unused");
    },
  } as AIProvider & { prompts: string[] };
}

describe("repository references", () => {
  it.each([
    ["acme/site", "acme/site"],
    ["https://github.com/acme/site", "acme/site"],
    ["github.com/acme/site.git", "acme/site"],
    ["https://github.com/acme/site/tree/release/v2", "acme/site#release/v2"],
    ["acme/site#develop", "acme/site#develop"],
  ])("normalizes %s", (input, expected) =>
    expect(formatRepository(parseRepository(input))).toBe(expected),
  );
  it.each([
    "acme",
    "https://gitlab.com/acme/site",
    "acme/site#../../etc",
    "acme/si te",
    "https://github.com/acme",
  ])("rejects %s", (input) => expect(() => parseRepository(input)).toThrow());
  it("transforms through the zod schema", () =>
    expect(repositoryReferenceSchema.parse("https://github.com/a/b")).toBe(
      "a/b",
    ));
});

describe("tar reader", () => {
  it("reads regular files, pax long names, and skips directories", () => {
    const longPath = "root/" + "deep/".repeat(30) + "file.ts";
    const pax = `${(longPath.length + 10).toString().padStart(3, "0")} path=${longPath}\n`;
    const archive = Buffer.concat([
      tarEntry("root/", "", "5"),
      tarEntry("root/a.txt", "hello"),
      tarEntry("PaxHeader", pax, "x"),
      tarEntry("ignored", "export const x = 1;"),
      tarEntry("root/big.bin", "x".repeat(600)),
      Buffer.alloc(1024),
    ]);
    const entries = readTar(archive, (_path, size) => size < 100);
    expect(entries.map((e) => e.path)).toEqual([
      "root/a.txt",
      longPath,
      "root/big.bin",
    ]);
    expect(entries[0].content?.toString()).toBe("hello");
    expect(entries[2].content).toBeUndefined();
    expect(entries[2].size).toBe(600);
  });
});

describe("static repository rules", () => {
  it("finds and masks committed secrets but ignores placeholders", () => {
    const issues = scanPatterns([
      file(
        "src/config.ts",
        'const stripe = "sk_live_' + "a".repeat(24) + '";\n',
      ),
      file("src/example.ts", 'const apiKey = "your-api-key-here-123";\n'),
      file(
        "deploy/key.pem",
        "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA7bq98d1X3kQ0pJmZ4wYbA6Sx2Vn8p1qLmN0oPq9rS2tUvWxYz\n",
      ),
      file("node_modules/pkg/index.js", "eval(userInput)"),
    ]);
    const titles = issues.map((i) => i.title);
    expect(titles).toContain("Stripe live secret key committed");
    expect(titles).toContain("Private key committed to the repository");
    expect(titles).not.toContain("Hard-coded credential");
    expect(issues.some((i) => i.path.startsWith("node_modules"))).toBe(false);
    const stripe = issues.find((i) => i.title.startsWith("Stripe"))!;
    expect(stripe.line).toBe(1);
    expect(stripe.snippet).not.toContain("a".repeat(24));
  });
  it("ignores fake fixtures: low-entropy values and PEM headers without key material", () => {
    const issues = scanPatterns([
      file("src/webhook.ts", 'const config = { secret: "whsec_siteforge" };\n'),
      file(
        "src/redact.ts",
        'const pem = "-----BEGIN RSA PRIVATE KEY-----\\nsensitive";\n',
      ),
      file("src/real.ts", 'const apiKey = "k8Zq2Lm9Xw4Rt7Vb1Nc";\n'),
    ]);
    expect(issues.map((i) => i.path)).toEqual(["src/real.ts"]);
  });
  it("keeps secrets in tests visible but low priority", () => {
    const [issue] = scanPatterns([
      file(
        "tests/a.test.ts",
        'const token = "ghp_' + "A1b2".repeat(9) + '";\n',
      ),
    ]);
    expect(issue).toMatchObject({
      severity: "low",
      title: "GitHub token committed",
    });
    expect(issue.description).toContain("test or example file");
  });
  it("flags dangerous code with file and line, and lowers test-only hits", () => {
    const issues = scanPatterns([
      file(
        "api/users.ts",
        "import db from './db';\nexport const find = (id) => db.query(`SELECT * FROM users WHERE id = ${id}`);\nhttps.request({ rejectUnauthorized: false });\n",
      ),
      file("tests/run.test.ts", "exec(`rm -rf ${dir}`);\n"),
      file("src/view.tsx", "<div className={display} />;\n// eval(old)\n"),
    ]);
    const sql = issues.find((i) => i.title.startsWith("SQL"))!;
    expect(sql).toMatchObject({
      path: "api/users.ts",
      line: 2,
      severity: "high",
    });
    expect(issues.find((i) => i.title.startsWith("TLS"))?.line).toBe(3);
    expect(issues.find((i) => i.path.startsWith("tests/"))?.severity).toBe(
      "low",
    );
    expect(issues.some((i) => i.path === "src/view.tsx")).toBe(false);
  });
  it("checks environment files, lockfiles, containers and workflows", () => {
    const titles = scanConfiguration([
      file(".env", "DATABASE_URL=postgres://u:p@db/app\n"),
      file(".env.example", "DATABASE_URL=\n"),
      file("package.json", JSON.stringify({ dependencies: { left: "*" } })),
      file("src/index.ts", "export {}"),
      file("Dockerfile", "FROM node\nCOPY . .\nCMD node index.js\n"),
      file(
        ".github/workflows/pr.yml",
        'on: pull_request_target\njobs:\n  b:\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          ref: ${{ github.event.pull_request.head.sha }}\n      - run: echo "${{ github.event.pull_request.title }}"\n      - uses: someone/action@v1\n',
      ),
    ]).map((i) => i.title);
    expect(titles).toEqual(
      expect.arrayContaining([
        "Environment file with values committed",
        "No dependency lockfile",
        "Dependencies use unbounded version ranges",
        "Container runs as root",
        "Base image node is not pinned",
        "pull_request_target checks out untrusted pull request code",
        "Workflow interpolates untrusted event text into a script",
        "Workflow does not restrict GITHUB_TOKEN permissions",
        "Third-party GitHub Actions are not pinned to a commit",
        "No automated tests found",
      ]),
    );
    expect(titles.filter((t) => t.startsWith("Environment file"))).toHaveLength(
      1,
    );
  });
  it("accepts a well-configured repository", () => {
    const titles = scanConfiguration([
      file(".gitignore", "node_modules\n"),
      file("README.md", "# App"),
      file("package.json", JSON.stringify({ dependencies: { a: "^1.0.0" } })),
      file("package-lock.json", "{}"),
      file("src/index.ts", "export {}"),
      file("src/index.test.ts", "it()"),
      file("Dockerfile", "FROM node:22-slim\nUSER node\nCMD node index.js\n"),
      file(
        ".github/workflows/ci.yml",
        "on: push\npermissions:\n  contents: read\njobs:\n  t:\n    steps:\n      - uses: actions/checkout@v4\n",
      ),
    ]).map((i) => i.title);
    expect(titles).toEqual([]);
  });
});

describe("dependency scanning", () => {
  it("parses npm, yarn, pip and cargo lockfiles", () => {
    const { dependencies } = collectDependencies([
      file(
        "package-lock.json",
        JSON.stringify({
          lockfileVersion: 3,
          packages: {
            "": { dependencies: { lodash: "^4" } },
            "node_modules/lodash": { version: "4.17.15" },
            "node_modules/a/node_modules/minimist": {
              version: "1.2.0",
              dev: true,
            },
          },
        }),
      ),
      file(
        "web/yarn.lock",
        '"axios@^0.21.0":\n  version "0.21.0"\n  resolved "x"\n',
      ),
      file("requirements.txt", "django==3.2.1\nrequests>=2\n"),
      file("Cargo.lock", '[[package]]\nname = "time"\nversion = "0.1.43"\n'),
    ]);
    expect(dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ecosystem: "npm",
          name: "lodash",
          version: "4.17.15",
          direct: true,
        }),
        expect.objectContaining({ name: "minimist", dev: true, direct: false }),
        expect.objectContaining({ name: "axios", version: "0.21.0" }),
        expect.objectContaining({
          ecosystem: "PyPI",
          name: "django",
          version: "3.2.1",
        }),
        expect.objectContaining({ ecosystem: "crates.io", name: "time" }),
      ]),
    );
    expect(dependencies.some((d) => d.name === "requests")).toBe(false);
  });
  it("reports vulnerable packages with severity and upgrade target from OSV", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/querybatch"))
        return Response.json({
          results: [{ vulns: [{ id: "GHSA-1" }, { id: "GHSA-2" }] }, {}],
        });
      const id = url.split("/").pop();
      return Response.json({
        id,
        summary: id === "GHSA-1" ? "Prototype pollution" : "ReDoS",
        aliases: ["CVE-2020-0001"],
        database_specific: { severity: id === "GHSA-1" ? "HIGH" : "MODERATE" },
        affected: [
          {
            package: { name: "lodash", ecosystem: "npm" },
            ranges: [
              {
                events: [
                  { introduced: "0" },
                  { fixed: id === "GHSA-1" ? "4.17.19" : "4.17.21" },
                ],
              },
            ],
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const issues = await scanDependencies([
      {
        ecosystem: "npm",
        name: "lodash",
        version: "4.17.15",
        file: "package-lock.json",
        direct: true,
      },
      {
        ecosystem: "npm",
        name: "safe",
        version: "1.0.0",
        file: "package-lock.json",
      },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      severity: "high",
      category: "dependencies",
    });
    expect(issues[0].title).toBe("lodash@4.17.15 has 2 known vulnerabilities");
    expect(issues[0].suggestedFix).toContain("4.17.21");
    expect(issues[0].suggestedFix).toContain("npm install lodash@4.17.21");
    expect(issues[0].description).toContain("CVE-2020-0001");
  });
  it("suggests upgrading past the last affected version when no fix is listed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/querybatch")
          ? Response.json({ results: [{ vulns: [{ id: "GHSA-3" }] }] })
          : Response.json({
              id: "GHSA-3",
              database_specific: { severity: "HIGH" },
              affected: [
                {
                  package: { name: "braces", ecosystem: "npm" },
                  ranges: [
                    {
                      events: [{ introduced: "0" }, { last_affected: "3.0.3" }],
                    },
                  ],
                },
              ],
            }),
      ),
    );
    const [issue] = await scanDependencies([
      {
        ecosystem: "npm",
        name: "braces",
        version: "3.0.3",
        file: "package-lock.json",
        dev: true,
        direct: false,
      },
    ]);
    // Development-only packages are lowered one step.
    expect(issue.severity).toBe("medium");
    expect(issue.suggestedFix).toContain("newer than 3.0.3");
    expect(issue.suggestedFix).toContain("transitive");
  });
});

describe("AI code review verification", () => {
  const source =
    "export function total(items) {\n  let sum = 0;\n  for (const i of items) sum + i.price;\n  return sum;\n}\n";
  it("locates snippets despite whitespace differences", () => {
    expect(locateSnippet(source, "for (const i of items) sum + i.price;")).toBe(
      3,
    );
    expect(
      locateSnippet(source, "  for (const i  of items)   sum + i.price;"),
    ).toBe(3);
    expect(locateSnippet(source, "return total * 2;")).toBeUndefined();
  });
  it("only accepts patches that match the real file", () => {
    const good =
      "--- a/src/cart.ts\n+++ b/src/cart.ts\n@@ -3 +3 @@\n-  for (const i of items) sum + i.price;\n+  for (const i of items) sum += i.price;\n";
    expect(validatePatch(good, "src/cart.ts", source)).toBe(true);
    expect(
      validatePatch(good.replace(/cart/g, "other"), "src/cart.ts", source),
    ).toBe(false);
    expect(
      validatePatch(
        good.replace("sum + i.price;\n+", "sum - 1;\n+"),
        "src/cart.ts",
        source,
      ),
    ).toBe(false);
  });
  it("discards findings that do not quote real code from the batch", async () => {
    const ai = fakeAI(() => ({
      summary: "Cart total is wrong.",
      issues: [
        {
          title: "Cart total never accumulates",
          category: "reliability",
          severity: "high",
          confidence: 0.95,
          path: "src/cart.ts",
          snippet: "for (const i of items) sum + i.price;",
          description: "The expression result is discarded.",
          suggestedFix: "Use +=.",
          patch:
            "--- a/src/cart.ts\n+++ b/src/cart.ts\n@@ -3 +3 @@\n-  for (const i of items) sum + i.price;\n+  for (const i of items) sum += i.price;\n",
        },
        {
          title: "Invented issue",
          category: "security",
          severity: "critical",
          confidence: 0.9,
          path: "src/cart.ts",
          snippet: "db.query(userInput)",
          description: "Not real.",
          suggestedFix: "n/a",
        },
        {
          title: "Unknown file",
          category: "code",
          severity: "low",
          confidence: 0.5,
          path: "src/missing.ts",
          snippet: "anything",
          description: "Not real.",
          suggestedFix: "n/a",
        },
      ],
    }));
    const result = await reviewRepository(
      ai,
      [file("src/cart.ts", source)],
      [],
    );
    expect(result.rejected).toBe(2);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ line: 3, confidence: 0.8 });
    expect(result.issues[0].patch).toBeDefined();
    expect(ai.prompts[0]).toContain("===== FILE: src/cart.ts =====");
  });
  it("splits large repositories into bounded batches", async () => {
    const ai = fakeAI(() => ({ summary: "", issues: [] }));
    const files = Array.from({ length: 6 }, (_, i) =>
      file(`src/f${i}.ts`, "x".repeat(30000)),
    );
    const result = await reviewRepository(ai, files, [], {
      batchChars: 70000,
      maxBatches: 2,
    });
    expect(ai.prompts).toHaveLength(2);
    expect(result.reviewedFiles).toBe(4);
    expect(result.skippedFiles).toBe(2);
  });
});

describe("repository scan", () => {
  it("combines static, dependency and AI findings into valid report findings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ results: [{}] })),
    );
    const events: string[] = [];
    const ai = fakeAI(() => ({ summary: "Looks reasonable.", issues: [] }));
    const result = await scanRepository({
      repository: "acme/app",
      ai,
      event: async (e) => {
        events.push(e.message);
      },
      snapshot: {
        reference: { owner: "acme", repo: "app" },
        branch: "main",
        commit: "a".repeat(40),
        truncated: false,
        files: [
          file(
            "package.json",
            JSON.stringify({ dependencies: { a: "1.0.0" } }),
          ),
          file(
            "package-lock.json",
            JSON.stringify({
              packages: { "node_modules/a": { version: "1.0.0" } },
            }),
          ),
          file(
            "src/server.ts",
            "https.get(url, { rejectUnauthorized: false });\n",
          ),
        ],
      },
    });
    expect(result.report).toMatchObject({
      name: "acme/app",
      dependencies: 1,
      reviewedFiles: 1,
    });
    expect(result.summary).toBe("Looks reasonable.");
    const tls = result.findings.find((f) => f.title.startsWith("TLS"))!;
    expect(tls.url).toBe(
      `https://github.com/acme/app/blob/${"a".repeat(40)}/src/server.ts#L1`,
    );
    for (const finding of result.findings) findingSchema.parse(finding);
    expect(events.some((m) => m.includes("OSV"))).toBe(true);
  });
  it("downloads and indexes a repository archive from GitHub", async () => {
    const archive = gzipSync(
      Buffer.concat([
        tarEntry("acme-app-abc/src/index.ts", "export const a = 1;"),
        tarEntry("acme-app-abc/logo.png", "\0PNG"),
        Buffer.alloc(1024),
      ]),
    );
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/repos/acme/app"))
        return Response.json({ default_branch: "main" });
      if (url.includes("/commits/")) return Response.json({ sha: "abc123" });
      if (url.includes("/tarball/abc123")) return new Response(archive);
      return new Response("missing", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const snapshot = await fetchRepositorySnapshot({
      owner: "acme",
      repo: "app",
    });
    expect(snapshot).toMatchObject({ branch: "main", commit: "abc123" });
    expect(snapshot.files).toEqual([
      { path: "src/index.ts", size: 19, text: "export const a = 1;" },
      { path: "logo.png", size: 4 },
    ]);
  });
  it("explains missing repositories", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 })),
    );
    await expect(
      fetchRepositorySnapshot({ owner: "acme", repo: "gone" }),
    ).rejects.toThrow("not found");
  });
});
