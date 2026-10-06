// Fixture workspace for the local UI preview. Never loaded by the production app.
import {
  findingSchema,
  score,
  scoreScope,
  type Finding,
} from "../../src/lib/audit/schema";

export const user = {
  id: "8d5f2c1e-4b7a-4c39-9a51-2f0e6d3b7c10",
  email: "alex@northwind.dev",
};

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

export const ids = {
  store: "1b4e28ba-2fa1-4d3b-9c8e-5a6f7d8e9f01",
  docs: "2c5f39cb-3ab2-4e4c-8d9f-6b7a8e9f0a12",
  api: "3d6a4adc-4bc3-4f5d-9eaf-7c8b9fa01b23",
  storeAudit: "a1000000-0000-4000-8000-000000000001",
  runningAudit: "a1000000-0000-4000-8000-000000000002",
  codeAudit: "a1000000-0000-4000-8000-000000000003",
  failedAudit: "a1000000-0000-4000-8000-000000000004",
  missionAudit: "a1000000-0000-4000-8000-000000000005",
  queuedAudit: "a1000000-0000-4000-8000-000000000006",
};

const commit = "4f2a9c1d8e7b6a5f4e3d2c1b0a9f8e7d6c5b4a39";
const blob = (repo: string, path: string, line?: number) =>
  `https://github.com/${repo}/blob/${commit}/${path}${line ? "#L" + line : ""}`;
export const shot = (audit: string, name: string) =>
  `${user.id}/${audit}/${name}.png`;

function source(
  repo: string,
  path: string,
  line: number | undefined,
  finding: Omit<
    Finding,
    "url" | "viewport" | "sourceFiles" | "evidence" | "reproductionSteps"
  > & { snippet?: string; evidenceType?: Finding["evidence"][number]["type"] },
): Finding {
  const { snippet, evidenceType, ...rest } = finding;
  const location = `${path}${line ? ":" + line : ""}`;
  return {
    ...rest,
    url: blob(repo, path, line),
    viewport: null,
    evidence: [
      {
        type: evidenceType ?? "source",
        detail: snippet ? `${location}\n${snippet}` : location,
        reference: path,
      },
    ],
    reproductionSteps: [`Open ${location} in ${repo}`],
    sourceFiles: [
      { path, lines: line ? String(line) : "", reason: finding.title },
    ],
  };
}

const site = "https://shop.northwind.dev";
const storeFindings: Array<{ data: Finding; status: string }> = [
  {
    status: "open",
    data: {
      title: "Content overflows the viewport",
      category: "responsive",
      severity: "high",
      confidence: 1,
      url: site + "/",
      viewport: { width: 390, height: 844 },
      description: "Document exceeds viewport by 212px.",
      evidence: [
        { type: "dom", detail: "Document exceeds viewport by 212px." },
        {
          type: "screenshot",
          detail: "mobile viewport",
          reference: shot(ids.storeAudit, "mobile"),
        },
      ],
      reproductionSteps: [
        `Open ${site}/`,
        "Set viewport to 390 × 844",
        "Content overflows the viewport",
      ],
      suggestedFix:
        "The promo banner uses a fixed 600px width. Let it shrink with the viewport.",
      sourceFiles: [
        {
          path: "src/components/PromoBanner.tsx",
          lines: "14-18",
          reason: "Fixed width on the banner container",
        },
      ],
      patch:
        '--- a/src/components/PromoBanner.tsx\n+++ b/src/components/PromoBanner.tsx\n@@ -14,5 +14,5 @@\n export function PromoBanner() {\n   return (\n-    <div style={{ width: 600 }} className="promo">\n+    <div style={{ maxWidth: 600, width: "100%" }} className="promo">\n       Free shipping on orders over $50\n     </div>\n',
    },
  },
  {
    status: "open",
    data: {
      title:
        "JavaScript error: TypeError: Cannot read properties of undefined (reading 'price')",
      category: "reliability",
      severity: "high",
      confidence: 1,
      url: site + "/products",
      viewport: { width: 1440, height: 900 },
      description:
        "TypeError: Cannot read properties of undefined (reading 'price')\n    at ProductCard (https://shop.northwind.dev/_next/static/chunks/app/products/page.js:1:4821)",
      evidence: [
        {
          type: "console",
          detail:
            "TypeError: Cannot read properties of undefined (reading 'price')",
        },
        {
          type: "screenshot",
          detail: "desktop viewport",
          reference: shot(ids.storeAudit, "products"),
        },
      ],
      reproductionSteps: [
        `Open ${site}/products`,
        "Set viewport to 1440 × 900",
        "Open the browser console",
      ],
      suggestedFix:
        "Guard against products without a variant before reading the price.",
      sourceFiles: [
        {
          path: "src/app/products/ProductCard.tsx",
          lines: "22",
          reason: "Reads variants[0].price without checking variants",
        },
      ],
      patch:
        "--- a/src/app/products/ProductCard.tsx\n+++ b/src/app/products/ProductCard.tsx\n@@ -22 +22 @@\n-  const price = product.variants[0].price;\n+  const price = product.variants[0]?.price ?? product.basePrice;\n",
    },
  },
  {
    status: "open",
    data: {
      title: "Buttons must have discernible text",
      category: "accessibility",
      severity: "high",
      confidence: 1,
      url: site + "/",
      viewport: { width: 1440, height: 900 },
      description:
        '{"rule":"button-name","nodes":[{"target":[".cart-toggle"],"html":"<button class=\\"cart-toggle\\"><svg …></svg></button>"}]}',
      evidence: [
        {
          type: "axe",
          detail:
            'rule button-name: <button class="cart-toggle"><svg …></svg></button>',
        },
        {
          type: "screenshot",
          detail: "desktop viewport",
          reference: shot(ids.storeAudit, "desktop"),
        },
      ],
      reproductionSteps: [`Open ${site}/`, "Inspect the cart icon button"],
      suggestedFix:
        'Add an accessible name, for example aria-label="Open cart".',
      sourceFiles: [],
    },
  },
  {
    status: "open",
    data: {
      title: "Missing content-security-policy header",
      category: "security",
      severity: "medium",
      confidence: 1,
      url: site + "/",
      viewport: null,
      description:
        "Without a Content Security Policy, any injected script runs with full page privileges.",
      evidence: [
        { type: "header", detail: "content-security-policy: (absent)" },
      ],
      reproductionSteps: [`Request ${site}/`, "Inspect the response headers"],
      suggestedFix:
        "Add a Content-Security-Policy header. Start with Content-Security-Policy-Report-Only to find violations, then enforce it.",
      sourceFiles: [],
    },
  },
  {
    status: "open",
    data: {
      title: "Primary call to action has low contrast on the hero image",
      category: "ux",
      severity: "medium",
      confidence: 0.7,
      url: site + "/",
      viewport: { width: 768, height: 1024 },
      description:
        "The white “Shop the sale” button sits on a light part of the hero photo at tablet width and is hard to see.",
      evidence: [
        {
          type: "screenshot",
          detail: "AI visual hypothesis; confirm manually",
          reference: shot(ids.storeAudit, "tablet"),
        },
      ],
      reproductionSteps: [`Open ${site}/`, "Set viewport to 768 × 1024"],
      suggestedFix:
        "Add a dark overlay behind the hero text or use the solid brand button style.",
      sourceFiles: [],
    },
  },
  {
    status: "open",
    data: {
      title: "Slow initial server response",
      category: "performance",
      severity: "medium",
      confidence: 1,
      url: site + "/",
      viewport: { width: 1440, height: 900 },
      description: "Measured TTFB: 1342ms (single browser navigation).",
      evidence: [{ type: "metric", detail: "TTFB 1342ms" }],
      reproductionSteps: [`Open ${site}/`],
      suggestedFix:
        "Profile server processing and cache delivery; repeat measurements across runs.",
      sourceFiles: [],
    },
  },
  {
    status: "resolved",
    data: {
      title: "Meta description is missing",
      category: "seo",
      severity: "low",
      confidence: 1,
      url: site + "/products",
      viewport: { width: 1440, height: 900 },
      description: "No non-empty meta description was found.",
      evidence: [{ type: "metadata", detail: "meta[name=description]: none" }],
      reproductionSteps: [`Open ${site}/products`],
      suggestedFix: "Add a concise page-specific description.",
      sourceFiles: [],
    },
  },
  {
    status: "open",
    data: source("northwind/storefront", "src/server/orders.ts", 42, {
      title: "SQL query built with string interpolation",
      category: "security",
      severity: "high",
      confidence: 0.6,
      description:
        "A SQL statement is built by inserting values into the query text, which allows SQL injection.",
      snippet:
        "const rows = await db.query(`SELECT * FROM orders WHERE customer = '${customerId}'`);",
      suggestedFix:
        "Use parameterized queries or the query builder's bindings ($1/?, named parameters) instead of string interpolation.",
      patch:
        "--- a/src/server/orders.ts\n+++ b/src/server/orders.ts\n@@ -42 +42 @@\n-const rows = await db.query(`SELECT * FROM orders WHERE customer = '${customerId}'`);\n+const rows = await db.query(\"SELECT * FROM orders WHERE customer = $1\", [customerId]);\n",
    }),
  },
  {
    status: "open",
    data: source("northwind/storefront", "package-lock.json", undefined, {
      title: "lodash@4.17.15 has 2 known vulnerabilities",
      category: "dependencies",
      severity: "high",
      confidence: 0.95,
      evidenceType: "dependency",
      snippet: "npm lodash 4.17.15",
      description:
        "Advisories from OSV.dev:\n- GHSA-p6mc-m468-83gw (CVE-2020-8203): Prototype pollution in lodash\n- GHSA-35jh-r3h4-6jhm (CVE-2021-23337): Command injection in lodash",
      suggestedFix:
        "Upgrade lodash to 4.17.21 or later: npm install lodash@4.17.21. Then run your tests and commit the updated lockfile.",
    }),
  },
  {
    status: "ignored",
    data: source(
      "northwind/storefront",
      ".github/workflows/deploy.yml",
      undefined,
      {
        title: "Workflow does not restrict GITHUB_TOKEN permissions",
        category: "security",
        severity: "low",
        confidence: 0.7,
        description:
          "Without a permissions block the token may have broad write access depending on repository settings.",
        suggestedFix:
          "Add `permissions: contents: read` at the top level and grant extra scopes only to jobs that need them.",
      },
    ),
  },
];

const apiRepo = "northwind/payments-api";
const codeFindings: Array<{ data: Finding; status: string }> = [
  source(apiRepo, "src/config/stripe.ts", 3, {
    title: "Stripe live secret key committed",
    category: "security",
    severity: "critical",
    confidence: 0.95,
    snippet: 'export const stripe = new Stripe("sk_l••••••••••••");',
    description:
      "A live Stripe secret key appears in source. It can create charges, refunds and read customer data.",
    suggestedFix:
      "Roll the key in the Stripe dashboard immediately, remove it from history, and read it from a server-side secret.",
  }),
  source(apiRepo, ".github/workflows/preview.yml", undefined, {
    title: "pull_request_target checks out untrusted pull request code",
    category: "security",
    severity: "critical",
    confidence: 0.85,
    description:
      "This workflow runs with repository secrets and write access while executing code from a fork's pull request.",
    suggestedFix:
      "Use the `pull_request` trigger for building untrusted code, or split into an unprivileged build job and a separate privileged job that only consumes artifacts.",
  }),
  source(apiRepo, "src/routes/webhooks.ts", 18, {
    title: "Webhook handler trusts unsigned payloads",
    category: "security",
    severity: "high",
    confidence: 0.8,
    snippet: "const event = JSON.parse(req.body);",
    description:
      "The Stripe webhook parses the request body without verifying the Stripe-Signature header, so anyone can mark orders as paid.\n\nAI code review finding; confirm before acting.",
    suggestedFix:
      "Verify the payload with stripe.webhooks.constructEvent(rawBody, signature, secret) before acting on it.",
    patch:
      '--- a/src/routes/webhooks.ts\n+++ b/src/routes/webhooks.ts\n@@ -18 +18,5 @@\n-const event = JSON.parse(req.body);\n+const event = stripe.webhooks.constructEvent(\n+  req.body,\n+  req.headers["stripe-signature"],\n+  process.env.STRIPE_WEBHOOK_SECRET,\n+);\n',
  }),
  source(apiRepo, "src/auth/session.ts", 27, {
    title: "JWT accepted without signature verification",
    category: "security",
    severity: "high",
    confidence: 0.7,
    snippet: "jwt.decode(token, { algorithms: ['none'] })",
    description:
      "Tokens are decoded without verifying their signature, so anyone can forge a session.",
    suggestedFix:
      'Verify JWTs with jwt.verify and an explicit key and algorithm list (for example ["HS256"]); never allow "none".',
  }),
  source(apiRepo, "src/jobs/retry.ts", 55, {
    title: "Failed payouts are retried forever",
    category: "reliability",
    severity: "medium",
    confidence: 0.75,
    snippet: "while (!ok) { ok = await sendPayout(job); }",
    description:
      "The loop has no attempt limit or backoff, so a permanently failing payout blocks the worker and hammers the bank API.\n\nAI code review finding; confirm before acting.",
    suggestedFix:
      "Cap attempts, add exponential backoff, and move exhausted jobs to a dead-letter queue.",
  }),
  source(apiRepo, "package-lock.json", undefined, {
    title: "axios@0.21.1 has 3 known vulnerabilities",
    category: "dependencies",
    severity: "high",
    confidence: 0.95,
    evidenceType: "dependency",
    snippet: "npm axios 0.21.1",
    description:
      "Advisories from OSV.dev:\n- GHSA-cph5-m8f7-6c5x (CVE-2021-3749): Inefficient regular expression\n- GHSA-wf5p-g6vw-rhxx (CVE-2023-45857): CSRF token leak\n- GHSA-jr5f-v2jv-69x6 (CVE-2025-27152): SSRF via absolute URLs",
    suggestedFix:
      "Upgrade axios to 1.8.2 or later: npm install axios@1.8.2. Then run your tests and commit the updated lockfile.",
  }),
  source(apiRepo, "Dockerfile", undefined, {
    title: "Container runs as root",
    category: "security",
    severity: "medium",
    confidence: 0.8,
    description:
      "The final image has no non-root USER, so a compromise of the app gives root inside the container.",
    suggestedFix:
      "Create an unprivileged user and add `USER <name>` before CMD/ENTRYPOINT.",
  }),
  source(apiRepo, "tsconfig.json", undefined, {
    title: "TypeScript strict mode is disabled",
    category: "code",
    severity: "low",
    confidence: 0.9,
    description:
      "With strict off, null/undefined errors and implicit any types are not caught at compile time.",
    suggestedFix:
      'Set "strict": true and fix the reported errors incrementally.',
  }),
  source(apiRepo, "", undefined, {
    title: "Repository has no README",
    category: "code",
    severity: "info",
    confidence: 1,
    description:
      "There is no top-level README explaining how to install, run and deploy the project.",
    suggestedFix:
      "Add a README.md with setup, configuration, test and deployment instructions.",
  }),
].map((data) => ({ data, status: "open" }));
// A repository-root finding has no file; keep the GitHub link at the repo root.
codeFindings[codeFindings.length - 1].data.url =
  "https://github.com/" + apiRepo;
codeFindings[codeFindings.length - 1].data.sourceFiles = [];

for (const issue of [...storeFindings, ...codeFindings])
  findingSchema.parse(issue.data);

const storeScope = scoreScope(true, true);
const codeScope = scoreScope(false, true);
const original = (list: typeof storeFindings, scope: typeof storeScope) =>
  score(
    list.map((i) => i.data),
    scope,
  );

export const projects = [
  {
    id: ids.store,
    user_id: user.id,
    name: "Northwind storefront",
    url: site,
    repository: "northwind/storefront",
    created_at: minutesAgo(60 * 24 * 12),
  },
  {
    id: ids.docs,
    user_id: user.id,
    name: "Developer docs",
    url: "https://docs.northwind.dev",
    repository: null,
    created_at: minutesAgo(60 * 24 * 5),
  },
  {
    id: ids.api,
    user_id: user.id,
    name: "Payments API",
    url: null,
    repository: apiRepo,
    created_at: minutesAgo(60 * 24 * 2),
  },
];

const base = {
  user_id: user.id,
  mission: null,
  allow_form_submission: false,
  error: null,
  report: null as unknown,
  started_at: null as string | null,
  finished_at: null as string | null,
  heartbeat_at: null as string | null,
};

export const audits = [
  {
    ...base,
    id: ids.queuedAudit,
    project_id: ids.docs,
    url: "https://docs.northwind.dev",
    repository: null,
    mode: "full",
    status: "queued",
    created_at: minutesAgo(1),
  },
  {
    ...base,
    id: ids.runningAudit,
    project_id: ids.store,
    url: site,
    repository: "northwind/storefront",
    mode: "full",
    status: "running",
    created_at: minutesAgo(3),
    started_at: minutesAgo(2),
  },
  {
    ...base,
    id: ids.storeAudit,
    project_id: ids.store,
    url: site,
    repository: "northwind/storefront",
    mode: "quick",
    status: "complete",
    created_at: minutesAgo(95),
    finished_at: minutesAgo(91),
    report: {
      summary:
        "The storefront works on desktop, but the mobile layout overflows, the products page throws a runtime error, and the order lookup is open to SQL injection. Fix the high-severity items first; each has a suggested patch.",
      score: original(storeFindings, storeScope),
      coverage: [
        `${site}/ (desktop)`,
        `${site}/ (tablet)`,
        `${site}/ (mobile)`,
        `${site}/products (desktop)`,
        `${site}/products (tablet)`,
        `${site}/products (mobile)`,
        "northwind/storefront@main: 184 files indexed, 171 analyzed, 64 AI-reviewed, 912 dependencies checked",
      ],
      warnings: [],
      repository: {
        name: "northwind/storefront",
        branch: "main",
        commit,
        files: 184,
        analyzedFiles: 171,
        dependencies: 912,
        reviewedFiles: 64,
        skippedFiles: 0,
        rejectedAIFindings: 2,
      },
      checks: {
        lighthouse: "Not run; browser navigation timing measured instead",
        visual: "Gemini screenshot analysis attempted",
        externalLinks: "Not checked; same-origin only",
        securityHeaders: "Homepage response headers and cookies checked",
        staticAnalysis:
          "Secrets, dangerous code patterns, CI, container and config rules over 171 text files",
        dependencies: "912 locked versions checked on OSV.dev",
        aiReview:
          "64 source files reviewed; 2 unverifiable AI claims discarded",
      },
    },
  },
  {
    ...base,
    id: ids.codeAudit,
    project_id: ids.api,
    url: null,
    repository: apiRepo,
    mode: "repository",
    status: "complete",
    created_at: minutesAgo(60 * 26),
    finished_at: minutesAgo(60 * 26 - 3),
    report: {
      summary:
        "A live Stripe key is committed and the webhook endpoint accepts unsigned events — together these let anyone forge payments. Rotate the key today, then verify webhook signatures.",
      score: original(codeFindings, codeScope),
      coverage: [
        `${apiRepo}@main: 96 files indexed, 90 analyzed, 41 AI-reviewed, 388 dependencies checked`,
      ],
      warnings: [],
      repository: {
        name: apiRepo,
        branch: "main",
        commit,
        files: 96,
        analyzedFiles: 90,
        dependencies: 388,
        reviewedFiles: 41,
        skippedFiles: 0,
        rejectedAIFindings: 1,
      },
      checks: {
        staticAnalysis:
          "Secrets, dangerous code patterns, CI, container and config rules over 90 text files",
        dependencies: "388 locked versions checked on OSV.dev",
        aiReview: "41 source files reviewed; 1 unverifiable AI claim discarded",
      },
    },
  },
  {
    ...base,
    id: ids.missionAudit,
    project_id: ids.docs,
    url: "https://docs.northwind.dev",
    repository: null,
    mode: "mission",
    mission: "Find the API rate limits page from the mobile navigation.",
    status: "partial",
    created_at: minutesAgo(60 * 50),
    finished_at: minutesAgo(60 * 50 - 4),
    report: {
      summary:
        "The mobile menu opens, but the rate limits page is only linked from the desktop sidebar.",
      score: score([], scoreScope(true, false)),
      coverage: [
        "https://docs.northwind.dev/ (desktop)",
        "https://docs.northwind.dev/ (tablet)",
        "https://docs.northwind.dev/ (mobile)",
      ],
      warnings: [
        "Mission partial: Reached the API reference, but no link to rate limits exists in the mobile navigation.",
      ],
      mission: {
        outcome: "PARTIAL",
        summary:
          "Reached the API reference, but no link to rate limits exists in the mobile navigation.",
        evidence: [
          { step: 3, observation: '"url":"https://docs.northwind.dev/api"' },
        ],
      },
      checks: {
        lighthouse: "Not run; browser navigation timing measured instead",
        visual: "Gemini screenshot analysis attempted",
        externalLinks: "Not checked; same-origin only",
      },
    },
  },
  {
    ...base,
    id: ids.failedAudit,
    project_id: ids.docs,
    url: "https://docs.northwind.dev",
    repository: null,
    mode: "quick",
    status: "failed",
    error: "Homepage returned HTTP 503. Check the URL and site availability.",
    created_at: minutesAgo(60 * 72),
    finished_at: minutesAgo(60 * 72 - 1),
  },
];

export const issues = [
  ...storeFindings.map((issue, index) => ({
    id: `b1000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    audit_id: ids.storeAudit,
    ...issue,
  })),
  ...codeFindings.map((issue, index) => ({
    id: `b2000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    audit_id: ids.codeAudit,
    ...issue,
  })),
];

let eventId = 1;
const events = (
  audit: string,
  list: Array<[string, string, string]>,
  start: number,
) =>
  list.map(([agent, status, message], index) => ({
    id: eventId++,
    audit_id: audit,
    agent,
    status,
    message,
    created_at: minutesAgo(start - index * 0.2),
  }));

export const agentRuns = [
  ...events(
    ids.storeAudit,
    [
      ["browser", "running", "Launching isolated browser"],
      ["browser", "complete", "Loaded homepage; discovered 34 links"],
      ["accessibility", "complete", "desktop: 3 axe violations on /"],
      ["browser", "complete", "Captured desktop screenshot on /"],
      ["visual", "complete", "Analysis complete: 1 additional hypotheses"],
      ["accessibility", "complete", "mobile: 2 axe violations on /"],
      ["browser", "complete", "Same-origin link checks complete"],
      ["code", "complete", "Indexed 184 files on main @ 4f2a9c1"],
      ["dependencies", "complete", "2 vulnerable packages found"],
      ["code", "complete", "AI review added 3 verified findings"],
      ["code", "complete", "Linked 2 website findings to source files"],
      ["report", "complete", "Normalized 10 evidence-backed findings"],
    ],
    95,
  ),
  ...events(
    ids.runningAudit,
    [
      ["browser", "running", "Launching isolated browser"],
      [
        "browser",
        "complete",
        "Loaded homepage; discovered 34 links and 58 sitemap URLs",
      ],
      ["accessibility", "complete", "desktop: 3 axe violations on /"],
      ["browser", "complete", "Captured desktop screenshot on /"],
      [
        "visual",
        "running",
        "Analyzing tablet screenshot and collected evidence",
      ],
    ],
    2,
  ),
  ...events(
    ids.codeAudit,
    [
      ["code", "running", "Downloading northwind/payments-api"],
      ["code", "complete", "Indexed 96 files on main @ 4f2a9c1"],
      [
        "code",
        "complete",
        "Static checks found 6 secret, configuration and code-pattern issues",
      ],
      ["dependencies", "complete", "1 vulnerable packages found"],
      ["code", "complete", "AI review added 2 verified findings"],
      ["report", "complete", "Normalized 9 evidence-backed findings"],
    ],
    60 * 26,
  ),
  ...events(
    ids.failedAudit,
    [
      ["browser", "running", "Launching isolated browser"],
      [
        "browser",
        "failed",
        "Homepage returned HTTP 503. Check the URL and site availability.",
      ],
    ],
    60 * 72,
  ),
];

export const missionSteps = [
  [
    "getInteractiveElements",
    {},
    [{ id: "el_3", type: "button", text: "Menu" }],
  ],
  ["clickElement", { id: "el_3" }, { url: "https://docs.northwind.dev/" }],
  ["navigateTo", { url: "/api" }, { url: "https://docs.northwind.dev/api" }],
].map(([tool, args, result], index) => ({
  id: index + 1,
  audit_id: ids.missionAudit,
  tool,
  args,
  result,
  created_at: minutesAgo(60 * 50 - index),
}));

export const screenshots = [
  ["desktop", 1440, 900, "/"],
  ["tablet", 768, 1024, "/"],
  ["mobile", 390, 844, "/"],
  ["products", 1440, 900, "/products"],
].map(([name, width, height, path], index) => ({
  id: `c1000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  audit_id: ids.storeAudit,
  path: shot(ids.storeAudit, String(name)),
  url: site + path,
  viewport: { name: name === "products" ? "desktop" : name, width, height },
  created_at: minutesAgo(93),
}));
screenshots.push({
  id: "c2000000-0000-4000-8000-000000000001",
  audit_id: ids.runningAudit,
  path: shot(ids.runningAudit, "live"),
  url: site + "/",
  viewport: { name: "live", width: 768, height: 1024 },
  created_at: minutesAgo(0.1),
});

export const billing = {
  billing_settings: [{ id: true, enabled: true }],
  billing_customers: [{ user_id: user.id, stripe_customer_id: "cus_preview" }],
  test_credits: [
    {
      user_id: user.id,
      kind: "monthly",
      remaining: 14,
      starts_at: minutesAgo(60 * 24 * 12),
      expires_at: new Date(Date.now() + 18 * 86400_000).toISOString(),
      revoked: false,
    },
    {
      user_id: user.id,
      kind: "single",
      remaining: 2,
      starts_at: minutesAgo(60 * 24 * 30),
      expires_at: null,
      revoked: false,
    },
  ],
};
