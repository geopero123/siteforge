// Isolated visual verification fixture; never loaded by the production app.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrowserSession } from "../src/lib/browser/session";
import { LiveBrowser } from "../src/components/live-browser";
process.env.ALLOW_LOCAL_AUDITS = "true";
const css = readFileSync("src/app/globals.css", "utf8").replace(
  /^@import.*$/m,
  "",
);
let frame: Buffer;
let siteUrl = "";
const server = createServer((req, res) => {
  if (req.url === "/frame.png") {
    res.setHeader("Content-Type", "image/png");
    res.end(frame);
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (req.url === "/site") {
    res.end(
      '<!doctype html><html lang="en"><head><title>Browser fixture</title></head><body style="font:20px system-ui;padding:40px;background:#fafaf7"><h1>Real browser test page</h1><p>This viewport is captured by Chromium.</p><button>Test navigation</button></body></html>',
    );
    return;
  }
  const component = renderToStaticMarkup(
    createElement(LiveBrowser, {
      queued: false,
      activity: "Checking the fixture viewport",
      frame: {
        id: "fixture",
        path: "fixture/live.png",
        url: siteUrl,
        signedUrl: "/frame.png",
        created_at: new Date().toISOString(),
        viewport: { name: "live", width: 390, height: 844 },
      },
    }),
  );
  res.end(
    `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>SiteForge preview verification</title><style>${css}</style></head><body><main style="max-width:1000px;margin:30px auto;padding:16px">${component}</main></body></html>`,
  );
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string")
  throw new Error("Fixture server failed");
const origin = `http://127.0.0.1:${address.port}`;
siteUrl = origin + "/site";
const browser = new BrowserSession(siteUrl);
try {
  await browser.start();
  await browser.navigateTo(siteUrl);
  await browser.setViewport(390, 844);
  frame = await browser.takeScreenshot();
} finally {
  await browser.close();
}
console.log(`Preview verification fixture: ${origin}`);
