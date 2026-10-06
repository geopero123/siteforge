// Renders a fictional storefront in Chromium so fixture audits show real captures.
import { chromium } from "playwright";
import { ids, shot } from "./fixtures";

const page = (body: string) => `<!doctype html><html lang="en"><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,sans-serif;color:#1d2321;background:#fbf8f3}
header{display:flex;justify-content:space-between;align-items:center;padding:18px 5vw;border-bottom:1px solid #e7dfd3}
.logo{font-weight:800;letter-spacing:-.5px;font-size:20px}nav{display:flex;gap:24px;font-size:14px}
.promo{width:600px;background:#1d2321;color:#fbf8f3;padding:10px 20px;font-size:13px}
.hero{min-height:420px;padding:70px 5vw;background:linear-gradient(120deg,#e9d6bd,#f6efe5 60%,#fff);display:grid;align-content:center}
.hero h1{font-size:clamp(34px,6vw,64px);line-height:1.05;margin:0 0 16px;max-width:620px;letter-spacing:-2px}
.hero p{max-width:440px;color:#5d625f}.cta{display:inline-block;margin-top:18px;padding:12px 22px;border:1px solid #fff;color:#fff;background:#ffffff33;border-radius:999px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:22px;padding:40px 5vw}
.card{background:#fff;border:1px solid #ece4d8;border-radius:14px;overflow:hidden}.img{height:170px}
.card div.t{padding:14px 16px}.card strong{display:block}.card span{color:#7a7f7c;font-size:14px}
</style></head><body>${body}</body></html>`;

const products = [
  "Linen shirt",
  "Canvas tote",
  "Wool beanie",
  "Field jacket",
  "Cotton tee",
  "Rain shell",
]
  .map(
    (name, i) =>
      `<div class="card"><div class="img" style="background:hsl(${30 + i * 25} 35% ${78 - i * 3}%)"></div><div class="t"><strong>${name}</strong><span>$${(29 + i * 14).toFixed(2)}</span></div></div>`,
  )
  .join("");
const header = `<div class="promo">Free shipping on orders over $50 · Autumn sale now on</div><header><span class="logo">northwind</span><nav><span>Shop</span><span>Journal</span><span>About</span><span>Cart (2)</span></nav></header>`;
const home = page(
  `${header}<section class="hero"><h1>Made for long walks and short days.</h1><p>Durable layers in natural fibres, designed in Copenhagen and built to be repaired.</p><a class="cta">Shop the sale</a></section><section class="grid">${products}</section>`,
);
const catalog = page(
  `${header}<section class="grid" style="padding-top:28px"><h2 style="grid-column:1/-1;margin:0;font-size:28px">All products</h2>${products}${products}</section>`,
);

export async function renderStorefront() {
  const images = new Map<string, Buffer>();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const tab = await context.newPage();
    const capture = async (
      html: string,
      width: number,
      height: number,
      path: string,
    ) => {
      await tab.setViewportSize({ width, height });
      await tab.setContent(html);
      images.set(path, await tab.screenshot({ type: "png" }));
    };
    await capture(home, 1440, 900, shot(ids.storeAudit, "desktop"));
    await capture(home, 768, 1024, shot(ids.storeAudit, "tablet"));
    await capture(home, 390, 844, shot(ids.storeAudit, "mobile"));
    await capture(catalog, 1440, 900, shot(ids.storeAudit, "products"));
    await capture(home, 768, 1024, shot(ids.runningAudit, "live"));
  } finally {
    await browser.close();
  }
  return images;
}
