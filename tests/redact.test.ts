import { expect, it, vi, afterEach } from "vitest";
import { redactSecrets } from "../src/lib/security/redact";
afterEach(() => vi.unstubAllEnvs());
it("removes known worker secrets even in error messages", () => {
  vi.stubEnv("GEMINI_API_KEY", "test-secret-that-must-stay-private");
  expect(
    redactSecrets("Request failed: test-secret-that-must-stay-private"),
  ).toBe("Request failed: [REDACTED]");
});
it("redacts common source credentials and preserves surrounding code", () => {
  const output = redactSecrets(
    'const apiKey = "secret-value"; const name = "Navbar";',
  );
  expect(output).not.toContain("secret-value");
  expect(output).toContain('name = "Navbar"');
});
it("removes PEM private keys and GitHub tokens", () => {
  const output = redactSecrets(
    "-----BEGIN RSA PRIVATE KEY-----\nsensitive\n-----END RSA PRIVATE KEY----- ghp_" +
      "a".repeat(36),
  );
  expect(output).not.toContain("sensitive");
  expect(output).not.toContain("a".repeat(36));
});
