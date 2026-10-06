import { chromium, type Browser, type Page } from "playwright";
import axe from "axe-core";
import { validateTarget, ToolBudget } from "../security/url";
export const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
];
export class BrowserSession {
  browser!: Browser;
  page!: Page;
  origin: string;
  consoleErrors: string[] = [];
  failedRequests: Array<{ url: string; error: string }> = [];
  insecureRequests: string[] = [];
  budget = new ToolBudget();
  private allowLocal: boolean;
  private ids = new Map<string, ReturnType<Page["locator"]>>();
  private closed = false;
  constructor(
    url: string,
    readonly allowSubmission = false,
  ) {
    this.origin = new URL(url).origin;
    this.allowLocal =
      process.env.ALLOW_LOCAL_AUDITS === "true" &&
      process.env.NODE_ENV !== "production";
  }
  async start() {
    this.browser = await chromium.launch({
      headless: true,
      chromiumSandbox: !this.allowLocal,
      env: Object.fromEntries(
        ["PATH", "HOME", "TMPDIR", "LANG", "TZ"].flatMap((name) =>
          process.env[name] ? [[name, process.env[name]!]] : [],
        ),
      ),
      args: ["--disable-quic"],
    });
    if (this.closed) {
      await this.browser.close();
      throw new Error("Browser session cancelled during launch");
    }
    const context = await this.browser.newContext({
      viewport: viewports[0],
      serviceWorkers: "block",
      acceptDownloads: false,
    });
    await context.route("**/*", async (route) => {
      try {
        const req = route.request();
        const target = await validateTarget(req.url(), this.allowLocal);
        if (req.isNavigationRequest() && target.origin !== this.origin)
          throw new Error("Cross-origin navigation blocked");
        if (
          !this.allowSubmission &&
          !["GET", "HEAD", "OPTIONS"].includes(req.method())
        )
          throw new Error("State-changing network request blocked");
        await route.continue();
      } catch {
        await route.abort("blockedbyclient");
      }
    });
    this.page = await context.newPage();
    this.page.setDefaultTimeout(8000);
    this.page.setDefaultNavigationTimeout(25000);
    context.on("page", (p) => {
      if (p !== this.page) void p.close();
    });
    this.page.on("dialog", (d) => void d.dismiss());
    this.page.on("console", (m) => {
      if (m.type() === "error" && this.consoleErrors.length < 60)
        this.consoleErrors.push(m.text().slice(0, 1000));
    });
    this.page.on("pageerror", (e) => {
      if (this.consoleErrors.length < 60)
        this.consoleErrors.push(e.message.slice(0, 1000));
    });
    this.page.on("request", (r) => {
      if (
        r.url().startsWith("http:") &&
        this.page.url().startsWith("https:") &&
        this.insecureRequests.length < 30
      )
        this.insecureRequests.push(r.url().split("?")[0]);
    });
    this.page.on("requestfailed", (r) => {
      if (this.failedRequests.length < 60)
        this.failedRequests.push({
          url: r.url().split("?")[0],
          error: r.failure()?.errorText ?? "Request failed",
        });
    });
    this.page.on("response", (r) => {
      if (r.status() >= 400 && this.failedRequests.length < 60)
        this.failedRequests.push({
          url: r.url().split("?")[0],
          error: `HTTP ${r.status()}`,
        });
    });
  }
  async navigateTo(url: string) {
    const target = await validateTarget(
      new URL(url, this.page.url() || this.origin).href,
      this.allowLocal,
    );
    if (target.origin !== this.origin)
      throw new Error("Navigation must stay on the original origin");
    const response = await this.page.goto(target.href, {
      waitUntil: "domcontentloaded",
    });
    await this.page.waitForTimeout(600);
    const headerList = (await response?.headersArray()) ?? [];
    return {
      url: this.page.url(),
      status: response?.status(),
      headers: Object.fromEntries(
        headerList.map(({ name, value }) => [name.toLowerCase(), value]),
      ),
      cookies: headerList
        .filter(({ name }) => name.toLowerCase() === "set-cookie")
        .map(({ value }) => parseSetCookie(value)),
    };
  }
  // Sitemaps list the pages a site considers important; links alone favor navigation.
  async sitemapUrls(limit = 200) {
    try {
      const target = await validateTarget(
        new URL("/sitemap.xml", this.origin).href,
        this.allowLocal,
      );
      const response = await this.page
        .context()
        .request.get(target.href, { maxRedirects: 0, timeout: 8000 });
      const body = response.ok()
        ? (await response.text()).slice(0, 2_000_000)
        : "";
      await response.dispose();
      return [...body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
        .map((match) => match[1].replace(/&amp;/g, "&"))
        .filter((url) => {
          try {
            return new URL(url).origin === this.origin && !/\.xml$/i.test(url);
          } catch {
            return false;
          }
        })
        .slice(0, limit);
    } catch {
      return [];
    }
  }
  async getInteractiveElements() {
    this.ids.clear();
    const elements = await this.page
      .locator('a[href],button,input,select,textarea,[role="button"]')
      .all();
    const out = [];
    for (let i = 0; i < Math.min(elements.length, 100); i++) {
      const loc = elements[i];
      if (!(await loc.isVisible())) continue;
      const id = `el_${i}`;
      this.ids.set(id, loc);
      out.push(
        await loc.evaluate(
          (el, id) => ({
            id,
            type: el.tagName.toLowerCase(),
            text: (
              el.getAttribute("aria-label") ||
              el.textContent ||
              el.getAttribute("placeholder") ||
              ""
            )
              .trim()
              .slice(0, 120),
            inputType: el.getAttribute("type"),
            href: el.getAttribute("href"),
            visible: true,
          }),
          id,
        ),
      );
    }
    return out;
  }
  private element(id: string) {
    const loc = this.ids.get(id);
    if (!loc)
      throw new Error(
        "Unknown or stale element ID; refresh interactive elements",
      );
    return loc;
  }
  async clickElement(id: string) {
    const loc = this.element(id);
    const info = await loc.evaluate((e) => ({
      text: [
        e.textContent,
        e.getAttribute("aria-label"),
        e.getAttribute("value"),
        e.getAttribute("title"),
      ]
        .join(" ")
        .toLowerCase(),
      type: e.getAttribute("type"),
      tag: e.tagName,
      form: !!e.closest("form"),
    }));
    if (
      /\b(delete|remove account|close account|purchase|buy( now)?|pay( now)?|place order|checkout|unsubscribe|transfer|withdraw)\b/.test(
        info.text,
      )
    )
      throw new Error("Destructive or purchase action blocked");
    if (!this.allowSubmission && (info.form || info.type === "submit"))
      throw new Error("Form submission requires explicit audit authorization");
    await loc.click();
    await this.page.waitForTimeout(400);
    return { url: this.page.url() };
  }
  async typeText(id: string, text: string) {
    if (text.length > 200) throw new Error("Input too long");
    await this.element(id).fill(text);
    return { filled: id };
  }
  async getPageText() {
    return (await this.page.locator("body").innerText()).slice(0, 12000);
  }
  async getLinks() {
    return this.page
      .locator("a[href]")
      .evaluateAll((es) =>
        [...new Set(es.map((e) => (e as HTMLAnchorElement).href))]
          .filter((u) => u.startsWith("http"))
          .slice(0, 80),
      );
  }
  async getDOMSnapshot() {
    return this.page.evaluate(() => ({
      title: document.title,
      url: location.href,
      description:
        document
          .querySelector('meta[name="description"]')
          ?.getAttribute("content") ?? "",
      canonical: document
        .querySelector('link[rel="canonical"]')
        ?.getAttribute("href"),
      lang: document.documentElement.lang,
      viewportMeta: !!document.querySelector('meta[name="viewport"]'),
      headings: Array.from(document.querySelectorAll("h1,h2,h3"))
        .slice(0, 40)
        .map((e) => ({
          level: e.tagName,
          text: e.textContent?.trim().slice(0, 160),
        })),
      overflow:
        Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        ) - innerWidth,
      clipped: Array.from(document.querySelectorAll("p,h1,h2,h3,button,a"))
        .filter((e) => {
          const s = getComputedStyle(e);
          return (
            ["hidden", "clip"].includes(s.overflow) &&
            e.scrollWidth > e.clientWidth + 4
          );
        })
        .slice(0, 10)
        .map((e) => e.textContent?.slice(0, 100)),
      metrics: performance.getEntriesByType("navigation").map((e) => {
        const n = e as PerformanceNavigationTiming;
        return {
          ttfb: n.responseStart - n.requestStart,
          domContentLoaded: n.domContentLoadedEventEnd,
          transferSize: n.transferSize,
        };
      }),
    }));
  }
  async accessibility() {
    await this.page.addScriptTag({ content: axe.source });
    return this.page.evaluate(async () => {
      const a = (window as unknown as { axe: typeof axe }).axe;
      const r = await a.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      });
      return r.violations.slice(0, 40).map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        help: v.help,
        helpUrl: v.helpUrl,
        nodes: v.nodes.slice(0, 6).map((n) => ({
          target: n.target,
          summary: n.failureSummary,
          html: n.html.slice(0, 500),
        })),
      }));
    });
  }
  async takeScreenshot() {
    return this.page.screenshot({
      fullPage: false,
      type: "png",
      animations: "disabled",
      timeout: 10000,
    });
  }
  async setViewport(width: number, height: number) {
    if (width < 320 || width > 1920 || height < 400 || height > 1200)
      throw new Error("Viewport outside limits");
    await this.page.setViewportSize({ width, height });
    await this.page.waitForTimeout(300);
    return { width, height };
  }
  async inspectElement(id: string) {
    return this.element(id).evaluate((e) => ({
      html: e.outerHTML.slice(0, 2000),
      bounds: JSON.parse(JSON.stringify(e.getBoundingClientRect())),
      style: {
        color: getComputedStyle(e).color,
        background: getComputedStyle(e).backgroundColor,
      },
    }));
  }
  async checkLink(url: string) {
    const target = await validateTarget(url, this.allowLocal);
    if (target.origin !== this.origin)
      throw new Error("Only same-origin links are checked");
    const r = await this.page
      .context()
      .request.get(target.href, { maxRedirects: 0, timeout: 8000 });
    const status = r.status();
    const location = r.headers().location;
    await r.dispose();
    return { url: target.href, status, location };
  }
  async execute(name: string, args: Record<string, unknown>) {
    this.budget.consume(name, args);
    switch (name) {
      case "navigateTo":
        return this.navigateTo(String(args.url));
      case "getInteractiveElements":
        return this.getInteractiveElements();
      case "clickElement":
        return this.clickElement(String(args.id));
      case "typeText":
        return this.typeText(String(args.id), String(args.text));
      case "getPageText":
        return this.getPageText();
      case "getDOMSnapshot":
        return this.getDOMSnapshot();
      case "inspectElement":
        return this.inspectElement(String(args.id));
      case "getConsoleErrors":
        return this.consoleErrors;
      case "getFailedRequests":
        return this.failedRequests;
      case "getLinks":
        return this.getLinks();
      case "takeScreenshot":
        return this.takeScreenshot();
      case "scrollPage":
        await this.page.mouse.wheel(
          0,
          Math.max(-844, Math.min(844, Number(args.amount) || 600)),
        );
        return { scrolled: true };
      case "goBack":
        await this.page.goBack({ waitUntil: "domcontentloaded" });
        return { url: this.page.url() };
      default:
        throw new Error("Unknown tool");
    }
  }
  async close() {
    this.closed = true;
    await this.browser?.close();
  }
}
function parseSetCookie(header: string) {
  const [pair, ...attributes] = header.split(";").map((part) => part.trim());
  const flags = attributes.map((attribute) => attribute.toLowerCase());
  return {
    name: pair.split("=")[0].slice(0, 100),
    secure: flags.includes("secure"),
    httpOnly: flags.includes("httponly"),
    sameSite:
      flags
        .find((flag) => flag.startsWith("samesite="))
        ?.slice(9)
        .replace(/^./, (c) => c.toUpperCase()) ?? "Lax",
  };
}
export type DOMSnapshot = Awaited<ReturnType<BrowserSession["getDOMSnapshot"]>>;
