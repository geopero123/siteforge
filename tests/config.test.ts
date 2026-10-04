import { afterEach, expect, it, vi } from "vitest";
import { supabasePublicKey } from "../src/lib/supabase/config";
afterEach(() => vi.unstubAllEnvs());
it("prefers the publishable key when both names are configured", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "legacy-test");
  expect(supabasePublicKey()).toBe("sb_publishable_test");
});
it("retains the legacy key fallback", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "legacy-test");
  expect(supabasePublicKey()).toBe("legacy-test");
});
