import type { Page } from "playwright";
export interface PreviewFrame {
  image: Buffer;
  url: string;
  viewport: { name: string; width: number; height: number };
  capturedAt: string;
}
export function startBrowserPreview(
  page: Page,
  publish: (frame: PreviewFrame) => Promise<void>,
  onError: (error: unknown) => void,
  intervalMs = 3000,
  signal?: AbortSignal,
) {
  let stopped = signal?.aborted ?? false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> | undefined;
  const tick = async () => {
    try {
      const url = page.url();
      const viewport = page.viewportSize();
      if (!page.isClosed() && /^https?:/.test(url) && viewport) {
        const image = await page.screenshot({ type: "png", timeout: 2000 });
        if (!stopped)
          await publish({
            image,
            url,
            viewport: { name: "live", ...viewport },
            capturedAt: new Date().toISOString(),
          });
      }
    } catch (error) {
      if (!stopped) onError(error);
    } finally {
      if (!stopped) timer = setTimeout(schedule, intervalMs);
    }
  };
  const schedule = () => {
    pending = tick();
  };
  const abort = () => {
    stopped = true;
    clearTimeout(timer);
  };
  signal?.addEventListener("abort", abort, { once: true });
  if (!stopped) timer = setTimeout(schedule, 0);
  return async () => {
    stopped = true;
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    await pending;
  };
}
