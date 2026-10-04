import { createServer } from "node:http";
import { strict as assert } from "node:assert";
import { BrowserSession } from "../src/lib/browser/session";
import { runAudit } from "../src/lib/audit/engine";
import type { AIProvider } from "../src/lib/ai/provider";
import type { AuditEvent } from "../src/lib/audit/schema";
import {
  startBrowserPreview,
  type PreviewFrame,
} from "../src/lib/browser/preview";
process.env.ALLOW_LOCAL_AUDITS = "true";
const server = createServer((req, res) => {
  if (req.url === "/missing") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.setHeader("Content-Type", "text/html");
  res.end(
    '<!doctype html><html><head><title>Fixture</title></head><body><main><h1>Broken fixture</h1><div style="width:1800px">Overflow</div><img src="/missing"><a href="/missing">Broken link</a><button onclick="document.querySelector(\'h1\').textContent=\'Clicked\'">Change heading</button><script>console.error("fixture runtime error")</script></main></body></html>',
  );
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const address = server.address();
assert(address && typeof address !== "string");
const url = `http://127.0.0.1:${address.port}`;
const browser = new BrowserSession(url);
try {
  await browser.start();
  await browser.navigateTo(url);
  const elements = await browser.getInteractiveElements();
  const button = elements.find((e) => e.text === "Change heading");
  assert(button);
  await browser.clickElement(button.id);
  assert((await browser.getPageText()).includes("Clicked"));
  const frames: PreviewFrame[] = [];
  const stopPreview = startBrowserPreview(
    browser.page,
    async (frame) => {
      frames.push(frame);
    },
    (e) => {
      throw e;
    },
    100,
  );
  try {
    for (let attempt = 0; !frames.length && attempt < 30; attempt++)
      await browser.page.waitForTimeout(100);
    assert(frames.length > 0);
    assert(frames[0].url === browser.page.url());
    assert(frames[0].image.readUInt32BE(16) === frames[0].viewport.width);
    assert(frames[0].image.readUInt32BE(20) === frames[0].viewport.height);
    await browser.page.evaluate(() => {
      document.querySelector("h1")!.textContent = "Preview changed";
    });
    for (
      let attempt = 0;
      !frames.some((f) => !f.image.equals(frames[0].image)) && attempt < 30;
      attempt++
    )
      await browser.page.waitForTimeout(100);
    assert(frames.some((f) => !f.image.equals(frames[0].image)));
  } finally {
    await stopPreview();
  }
  const stoppedAt = frames.length;
  await browser.page.waitForTimeout(250);
  assert(frames.length === stoppedAt);
  assert(browser.consoleErrors.includes("fixture runtime error"));
  assert((await browser.checkLink(url + "/missing")).status === 404);
  await assert.rejects(
    () => browser.navigateTo("https://example.com"),
    "Cross origin must be blocked",
  );
} finally {
  await browser.close();
}
let aiCalls = 0,
  screenshotCount = 0;
const events: AuditEvent[] = [];
// Injected provider is a test boundary only. Production has no mock provider or fixtures.
const ai: AIProvider = {
  generate: async () => "",
  generateStructured: async <T>() =>
    ({ issues: [], summary: "Fixture evidence reviewed" }) as T,
  analyzeImage: async <T>(_p: string, images: Buffer[]) => {
    assert(images[0].length > 100);
    aiCalls++;
    return { issues: [], summary: "Fixture evidence reviewed" } as T;
  },
  callTools: async () => ({
    role: "model",
    parts: [{ text: '{"outcome":"PARTIAL","summary":"Test boundary"}' }],
  }),
};
try {
  const result = await runAudit({
    url,
    mode: "quick",
    ai,
    event: async (e) => {
      events.push(e);
    },
    screenshot: async (b) => {
      assert(b.length > 100);
      return `fixture/${++screenshotCount}.png`;
    },
    page: async () => {},
    step: async () => {},
  });
  assert(result.issues.some((f) => f.category === "responsive"));
  assert(result.issues.some((f) => f.category === "accessibility"));
  assert(result.issues.some((f) => f.category === "reliability"));
  assert(result.issues.some((f) => f.category === "seo"));
  assert(result.score.overall < 100);
  assert(screenshotCount === 3);
  assert(aiCalls === 3);
  assert(result.coverage.length === 3);
  assert(result.warnings.some((w) => w.includes("HTTP 404")));
  assert(
    result.issues.filter((f) => f.title === "JavaScript console error")
      .length <= 1,
  );
  assert(events.some((e) => e.agent === "report"));
  const controller = new AbortController();
  let persistedAfterCancellation = 0;
  await assert.rejects(
    () =>
      runAudit({
        url,
        mode: "quick",
        ai,
        signal: controller.signal,
        event: async () => {},
        screenshot: async () => {
          controller.abort(new Error("Fixture cancellation"));
          return "cancelled.png";
        },
        page: async () => {
          persistedAfterCancellation++;
        },
        step: async () => {},
      }),
    /Fixture cancellation/,
  );
  assert(persistedAfterCancellation === 0);
  await assert.rejects(
    () =>
      runAudit({
        url,
        mode: "quick",
        ai,
        timeoutMs: 50,
        event: async () => {},
        screenshot: async () => "unused.png",
        page: async () => {},
        step: async () => {},
      }),
    /deadline/,
  );
  console.log(
    JSON.stringify({
      result: "PASS",
      screenshots: screenshotCount,
      aiEvidenceCalls: aiCalls,
      issues: result.issues.length,
      score: result.score.overall,
      warnings: result.warnings,
    }),
  );
} finally {
  await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
}
