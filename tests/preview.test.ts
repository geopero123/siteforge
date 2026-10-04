import { afterEach, expect, it, vi } from "vitest";
import type { Page } from "playwright";
import {
  startBrowserPreview,
  type PreviewFrame,
} from "../src/lib/browser/preview";
afterEach(() => vi.useRealTimers());
function page(url = "https://example.com") {
  return {
    url: () => url,
    viewportSize: () => ({ width: 390, height: 844 }),
    isClosed: () => false,
    screenshot: vi.fn(async () => Buffer.from("frame")),
  };
}
it("publishes actual captures with the page URL, viewport and time", async () => {
  vi.useFakeTimers();
  const browser = page();
  const publish = vi.fn(async (frame: PreviewFrame) => {
    expect(frame.image.length).toBeGreaterThan(0);
  });
  const stop = startBrowserPreview(
    browser as unknown as Page,
    publish,
    vi.fn(),
    100,
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(publish.mock.calls[0]?.[0]).toMatchObject({
    image: Buffer.from("frame"),
    url: "https://example.com",
    viewport: { width: 390, height: 844, name: "live" },
  });
  await stop();
  await vi.advanceTimersByTimeAsync(500);
  expect(publish).toHaveBeenCalledTimes(1);
});
it("skips the initial blank browser page", async () => {
  vi.useFakeTimers();
  const browser = page("about:blank");
  const publish = vi.fn(async () => {});
  const stop = startBrowserPreview(
    browser as unknown as Page,
    publish,
    vi.fn(),
    100,
  );
  await vi.advanceTimersByTimeAsync(200);
  expect(browser.screenshot).not.toHaveBeenCalled();
  await stop();
});
it("does not overlap uploads and waits for an in-flight frame on stop", async () => {
  vi.useFakeTimers();
  let release!: () => void;
  const publish = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const stop = startBrowserPreview(
    page() as unknown as Page,
    publish,
    vi.fn(),
    100,
  );
  await vi.advanceTimersByTimeAsync(500);
  expect(publish).toHaveBeenCalledTimes(1);
  const stopping = stop();
  release();
  await stopping;
  await vi.advanceTimersByTimeAsync(500);
  expect(publish).toHaveBeenCalledTimes(1);
});
it("reports a failed preview without an unhandled rejection and retries", async () => {
  vi.useFakeTimers();
  const publish = vi.fn(async () => {
    throw new Error("Upload unavailable");
  });
  const error = vi.fn();
  const stop = startBrowserPreview(
    page() as unknown as Page,
    publish,
    error,
    100,
  );
  await vi.advanceTimersByTimeAsync(100);
  expect(error).toHaveBeenCalledTimes(2);
  await stop();
});
it("stops capturing immediately when the audit is aborted", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const publish = vi.fn(async () => {});
  const stop = startBrowserPreview(
    page() as unknown as Page,
    publish,
    vi.fn(),
    100,
    controller.signal,
  );
  await vi.advanceTimersByTimeAsync(0);
  controller.abort();
  await vi.advanceTimersByTimeAsync(500);
  expect(publish).toHaveBeenCalledTimes(1);
  await stop();
});
