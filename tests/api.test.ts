import { it, expect } from "vitest";
import { apiError, assertSameOrigin } from "../src/lib/api";

const request = (headers: Record<string, string>) =>
  new Request("http://localhost:3000/api/audits", { method: "POST", headers });

it("accepts requests whose origin matches the server URL", () => {
  expect(() =>
    assertSameOrigin(request({ origin: "http://localhost:3000" })),
  ).not.toThrow();
});

it("accepts same-origin requests when Next.js reports its bind address", () => {
  // Behind a proxy or another hostname, request.url can say localhost while the
  // browser used the real host; the Host header carries what the browser used.
  expect(() =>
    assertSameOrigin(
      request({ origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" }),
    ),
  ).not.toThrow();
  expect(() =>
    assertSameOrigin(
      request({
        origin: "https://siteforge.example",
        host: "internal:3000",
        "x-forwarded-host": "siteforge.example",
      }),
    ),
  ).not.toThrow();
});

it("rejects other, missing and malformed origins with 403", async () => {
  for (const headers of <Array<Record<string, string>>>[
    { origin: "https://evil.example", host: "siteforge.example" },
    { host: "siteforge.example" },
    { origin: "null", host: "siteforge.example" },
    {
      origin: "https://evil.example",
      host: "siteforge.example",
      "x-forwarded-host": "siteforge.example",
    },
  ]) {
    let error: unknown;
    try {
      assertSameOrigin(request(headers));
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(Error);
    expect(apiError(error).status).toBe(403);
  }
});
