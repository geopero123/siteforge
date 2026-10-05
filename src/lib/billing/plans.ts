export const plans = {
  single: { name: "Pay as you go", amount: 200, tests: 1, price: "$2" },
  monthly: { name: "Forge Monthly", amount: 799, tests: 20, price: "$7.99" },
} as const;
export type Plan = keyof typeof plans;

export interface Credit {
  kind: "single" | "monthly";
  remaining: number;
  starts_at: string;
  expires_at: string | null;
  revoked: boolean;
}
export function availableCredits(credits: Credit[], now = Date.now()) {
  const active = credits.filter(
    (credit) =>
      !credit.revoked &&
      Date.parse(credit.starts_at) <= now &&
      (!credit.expires_at || Date.parse(credit.expires_at) > now),
  );
  return {
    single: active
      .filter((c) => c.kind === "single")
      .reduce((sum, c) => sum + c.remaining, 0),
    monthly: active
      .filter((c) => c.kind === "monthly")
      .reduce((sum, c) => sum + c.remaining, 0),
    periodEnd:
      active
        .filter((c) => c.kind === "monthly")
        .map((c) => c.expires_at!)
        .sort()[0] ?? null,
  };
}
