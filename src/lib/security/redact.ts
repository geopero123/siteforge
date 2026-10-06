export function redactSecrets(text: string) {
  let result = text
    .replace(
      /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,
      "[REDACTED PRIVATE KEY]",
    )
    .replace(
      /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[A-Za-z0-9_-]{30,}|sk-[A-Za-z0-9_-]{20,}|(?:sk|rk)_live_[A-Za-z0-9]{20,}|whsec_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|(?:AKIA|ASIA)[0-9A-Z]{16})\b/g,
      "[REDACTED TOKEN]",
    )
    .replace(
      /((?:api[_-]?key|secret|password|access[_-]?token|authorization)\s*[=:]\s*["'`])[^"'`\n]+(["'`])/gi,
      "$1[REDACTED]$2",
    );
  for (const name of [
    "GEMINI_API_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GITHUB_TOKEN",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
  ]) {
    const value = process.env[name];
    if (value && value.length >= 8)
      result = result.split(value).join("[REDACTED]");
  }
  return result;
}
