// End-to-end UI test: runs the app against the in-memory Supabase stand-in,
// checks every page for errors and layout overflow at desktop and mobile widths,
// then exercises the main flows. Set UI_SCREENSHOTS=<dir> to save screenshots.
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { startPreview } from "./preview/start";
import { ids } from "./preview/fixtures";

const preview = await startPreview({
  appPort: Number(process.env.UI_TEST_APP_PORT) || 3200,
  supabasePort: Number(process.env.UI_TEST_SUPABASE_PORT) || 54400,
  quiet: true,
});
const app = preview.appOrigin;
const supa = preview.supabase.url;
const screenshots = process.env.UI_SCREENSHOTS;
if (screenshots) mkdirSync(screenshots, { recursive: true });
const results: string[] = [];
let failures = 0;
async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push(`PASS ${name}`);
  } catch (e) {
    failures++;
    results.push(`FAIL ${name}: ${String(e).split("\n")[0].slice(0, 300)}`);
  }
}
function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const routes: Array<[string, string, ((page: Page) => Promise<void>)?]> = [
  ["landing", "/"],
  ["login", "/login"],
  ["dashboard", "/dashboard"],
  ["projects", "/dashboard/projects"],
  ["project", "/dashboard/projects/" + ids.store],
  ["new", "/dashboard/new"],
  ["missions", "/dashboard/missions"],
  ["report", "/dashboard/audits/" + ids.storeAudit],
  [
    "finding",
    "/dashboard/audits/" + ids.storeAudit,
    (page) => page.locator(".issue-row").first().click(),
  ],
  ["running", "/dashboard/audits/" + ids.runningAudit],
  ["code", "/dashboard/audits/" + ids.codeAudit],
  ["mission", "/dashboard/audits/" + ids.missionAudit],
  ["failed", "/dashboard/audits/" + ids.failedAudit],
  ["queued", "/dashboard/audits/" + ids.queuedAudit],
  ["billing", "/dashboard/billing"],
  ["settings", "/dashboard/settings"],
];

const browser = await chromium.launch();
try {
  for (const [device, viewport] of [
    ["desktop", { width: 1440, height: 900 }],
    ["mobile", { width: 390, height: 844 }],
  ] as const) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push("page error: " + e.message));
    page.on("console", (m) => {
      if (m.type() === "error") problems.push("console: " + m.text());
    });
    await page.goto(supa + "/__signin");
    for (const [name, path, action] of routes)
      await step(
        `${device} ${name} renders without errors or overflow`,
        async () => {
          problems.length = 0;
          await page.goto(app + path, { waitUntil: "networkidle" });
          await page.waitForSelector(
            path.includes("/audits/") ? ".audit-head" : "h1",
            { timeout: 30000 },
          );
          await action?.(page);
          await page.waitForTimeout(300);
          // Text pushed past the right edge is a layout bug even when clipped.
          const clipped = await page.evaluate(() =>
            [
              ...document.querySelectorAll(
                "h1,h2,h3,p,a,button,input,select,label,li,strong,small",
              ),
            ]
              .filter((element) => {
                const box = element.getBoundingClientRect();
                if (!box.width || box.right <= innerWidth + 1) return false;
                for (
                  let parent = element.parentElement;
                  parent && parent !== document.body;
                  parent = parent.parentElement
                )
                  if (
                    ["auto", "scroll", "hidden"].includes(
                      getComputedStyle(parent).overflowX,
                    )
                  )
                    return false;
                return true;
              })
              .map((element) =>
                (element.textContent ?? "").trim().slice(0, 40),
              ),
          );
          if (screenshots)
            await page.screenshot({
              path: `${screenshots}/${name}-${device}.png`,
              fullPage: !action,
            });
          expect(
            !clipped.length,
            "content past the viewport: " + clipped.join(" | "),
          );
          expect(!problems.length, problems.join("; "));
        },
      );
    await context.close();
  }

  const context = await browser.newContext({
    viewport: { width: 1280, height: 860 },
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: app,
  });
  const page = await context.newPage();
  await step("logged-out dashboard redirects to login", async () => {
    await page.goto(app + "/dashboard");
    await page.waitForURL(/\/login/);
  });
  await step("login sends a magic link", async () => {
    await page.fill('input[type="email"]', "alex@northwind.dev");
    await page.click("text=Email me a sign-in link");
    await page
      .getByText("Check alex@northwind.dev for a secure sign-in link.")
      .waitFor();
  });
  await page.goto(supa + "/__signin");
  await page.waitForURL(/\/dashboard$/);

  await step(
    "landing routes a GitHub link to a new code-only project",
    async () => {
      await page.goto(app + "/");
      await page.fill(
        'input[aria-label="Website URL or GitHub repository"]',
        "https://github.com/acme/new-repo",
      );
      await page.click("text=Run audit");
      await page.waitForURL(/\/dashboard\/new\?repository=acme%2Fnew-repo/);
      await page.locator(".mode-option").first().waitFor();
      expect(
        (await page.locator("select").first().inputValue()) === "",
        "project should be new",
      );
      expect(
        (await page
          .locator('input[placeholder="Marketing website"]')
          .inputValue()) === "new-repo",
        "name prefilled",
      );
      expect(
        await page.locator('input[value="repository"]').isChecked(),
        "code-only mode selected",
      );
      expect(
        (await page
          .locator('input[aria-describedby="repository-help"]')
          .inputValue()) === "acme/new-repo",
        "repo prefilled",
      );
    },
  );
  await step(
    "scanning a repository creates the project and a queued audit",
    async () => {
      await page.click("button:has-text('Scan repository')");
      await page.waitForURL(/\/dashboard\/audits\/[0-9a-f-]{36}$/);
      await page.getByText("Waiting for a worker").waitFor();
      await page
        .locator(".badge.queued", { hasText: "Queued" })
        .first()
        .waitFor();
      expect(
        await page.getByText("acme/new-repo").first().isVisible(),
        "repo chip shown",
      );
    },
  );
  await step(
    "landing routes a plain domain to a website audit for the matching project",
    async () => {
      await page.goto(app + "/");
      await page.fill(
        'input[aria-label="Website URL or GitHub repository"]',
        "shop.northwind.dev",
      );
      await page.click("text=Run audit");
      await page.waitForURL(/\/dashboard\/new\?url=/);
      await page.locator(".mode-option").first().waitFor();
      const selected = await page
        .locator("select")
        .first()
        .evaluate((s: HTMLSelectElement) => s.selectedOptions[0].text);
      expect(
        selected === "Northwind storefront",
        "matching project selected, got " + selected,
      );
      expect(
        await page.locator('input[value="quick"]').isChecked(),
        "quick mode",
      );
      expect(
        (await page.locator('input[type="url"]').inputValue()) ===
          "https://shop.northwind.dev",
        "url normalized",
      );
    },
  );
  await step("an unreachable domain gets a readable error", async () => {
    await page.click("button:has-text('Audit website and code')");
    await page.getByText("Couldn't find shop.northwind.dev").waitFor();
  });
  await step(
    "a fourth pending audit is refused with a clear message",
    async () => {
      await page.locator('input[value="repository"]').check({ force: true });
      await page.click("button:has-text('Scan repository')");
      await page.getByText("You already have three pending audits").waitFor();
    },
  );
  await step("validation: invalid repository is reported inline", async () => {
    await page.locator('input[value="repository"]').check({ force: true });
    await page.fill('input[aria-describedby="repository-help"]', "not a repo");
    await page.locator(".field-help.error").waitFor();
  });

  const report = app + "/dashboard/audits/a1000000-0000-4000-8000-000000000001";
  // The ring draws its number with a CSS counter; its label carries the value.
  const reportScore = async () =>
    Number(
      (
        await page.locator(".score-ring").first().getAttribute("aria-label")
      )?.match(/\d+/)?.[0],
    );
  await step("report renders score, summary and findings", async () => {
    await page.goto(report);
    await page.locator(".score-ring").waitFor();
    expect((await page.locator(".issue-row").count()) === 10, "10 findings");
    expect(await page.getByText("Repository scan").isVisible(), "repo panel");
  });
  await step("severity chip filters to open high findings", async () => {
    await page.locator(".severity-count", { hasText: "High" }).click();
    await page.waitForFunction(
      () => document.querySelectorAll(".issue-row").length === 5,
    );
    await page.click("text=Clear filters");
    await page.waitForFunction(
      () => document.querySelectorAll(".issue-row").length === 10,
    );
  });
  await step("search narrows findings", async () => {
    await page.fill('input[aria-label="Search findings"]', "lodash");
    await page.waitForFunction(
      () => document.querySelectorAll(".issue-row").length === 1,
    );
    await page.fill('input[aria-label="Search findings"]', "");
  });
  await step("status filter shows resolved findings", async () => {
    await page.selectOption(
      'select[aria-label="Filter by status"]',
      "resolved",
    );
    await page.waitForFunction(
      () => document.querySelectorAll(".issue-row").length === 1,
    );
    await page.selectOption('select[aria-label="Filter by status"]', "");
  });
  await step(
    "resolving a finding updates the drawer, list and score",
    async () => {
      const before = await reportScore();
      await page.locator(".issue-row").first().click();
      await page.locator(".detail").waitFor();
      expect(
        (await page.evaluate(() => document.body.style.overflow)) === "hidden",
        "body scroll locked",
      );
      await page.click(".detail >> text=Mark resolved");
      await page.locator(".detail .badge.resolved").waitFor();
      const after = await reportScore();
      expect(after > before, `score should rise: ${before} -> ${after}`);
      // The visible number follows too, not just the label.
      await page.waitForFunction(
        (score) =>
          getComputedStyle(
            document.querySelector(".score-ring .count")!,
          ).getPropertyValue("--n") === String(score),
        after,
        { timeout: 5000 },
      );
      await page.click(".detail >> text=Reopen");
      await page
        .locator(".detail .badge.resolved")
        .waitFor({ state: "detached" });
      await page.keyboard.press("Escape");
      await page.locator(".detail").waitFor({ state: "detached" });
      expect(
        (await page.evaluate(() => document.body.style.overflow)) === "",
        "body scroll restored",
      );
    },
  );
  await step("copying a patch puts the diff on the clipboard", async () => {
    await page.locator(".issue-row", { hasText: "SQL query" }).click();
    await page.click(".detail >> text=Copy");
    await page.locator(".detail >> text=Copied").waitFor();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(
      clip.includes("+const rows = await db.query("),
      "clipboard has patch",
    );
    await page.locator(".backdrop").click({ position: { x: 20, y: 400 } });
    await page.locator(".detail").waitFor({ state: "detached" });
  });
  await step("ignoring then reopening a finding", async () => {
    await page.locator(".issue-row", { hasText: "Slow initial" }).click();
    await page.click(".detail >> button:has-text('Ignore')");
    await page.locator(".detail .badge.ignored").waitFor();
    await page.click(".detail >> button:has-text('Reopen')");
    await page.locator(".detail .badge.ignored").waitFor({ state: "detached" });
    await page.keyboard.press("Escape");
  });
  await step("running audit shows the live browser frame", async () => {
    await page.goto(
      app + "/dashboard/audits/a1000000-0000-4000-8000-000000000002",
    );
    await page.locator(".browser-screen img").waitFor();
    const ok = await page
      .locator(".browser-screen img")
      .evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      );
    expect(ok, "live frame image loaded");
  });
  await step("failed audit explains the error", async () => {
    await page.goto(
      app + "/dashboard/audits/a1000000-0000-4000-8000-000000000004",
    );
    await page.getByText("This audit failed.").waitFor();
  });
  await step("mission report shows outcome and steps", async () => {
    await page.goto(
      app + "/dashboard/audits/a1000000-0000-4000-8000-000000000005",
    );
    await page.getByText("Mission steps / 3").waitFor();
    await page.locator(".badge.partial").first().waitFor();
  });
  await step(
    "project page saves and normalizes a repository link",
    async () => {
      await page.goto(
        app + "/dashboard/projects/2c5f39cb-3ab2-4e4c-8d9f-6b7a8e9f0a12",
      );
      const input = page.locator('input[placeholder^="owner/repo"]');
      await input.fill("https://github.com/northwind/docs-site/tree/main");
      await page.click("text=Save repository");
      await page.locator(".alert.success").waitFor();
      expect(
        (await input.inputValue()) === "northwind/docs-site#main",
        "normalized: " + (await input.inputValue()),
      );
      await input.fill("nope");
      await page.click("text=Save repository");
      await page.locator(".alert.error").waitFor();
    },
  );
  await step("creating a project without a target is rejected", async () => {
    await page.goto(app + "/dashboard/projects");
    await page.fill('input[name="name"]', "Empty");
    await page.click("button:has-text('Create project')");
    await page.locator(".alert.error").waitFor();
  });
  await step("creating a website project opens it", async () => {
    await page.fill('input[name="url"]', "https://blog.northwind.dev");
    await page.click("button:has-text('Create project')");
    await page.waitForURL(/\/dashboard\/projects\/[0-9a-f-]{36}$/);
    await page.getByRole("heading", { name: "Empty" }).waitFor();
  });
  await step(
    "billing shows balances and disables checkout until configured",
    async () => {
      await page.goto(app + "/dashboard/billing");
      await page.locator(".stat", { hasText: "16" }).waitFor();
      expect(
        await page.locator("button:has-text('Buy one test')").isDisabled(),
        "checkout disabled",
      );
    },
  );
  await step("unknown pages show the styled 404", async () => {
    const response = await page.goto(app + "/definitely-missing");
    expect(response?.status() === 404, "404 status");
    await page.getByText("This page doesn’t exist").waitFor();
  });
  await step(
    "sign out returns to the landing page and ends the session",
    async () => {
      await page.goto(app + "/dashboard");
      await page.click('button[aria-label="Sign out"]');
      await page.waitForURL(app + "/");
      await page.goto(app + "/dashboard");
      await page.waitForURL(/\/login/);
    },
  );
} finally {
  await browser.close();
  await preview.stop();
}
console.log(results.join("\n"));
console.log(`\n${results.length - failures} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
