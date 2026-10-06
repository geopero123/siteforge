import type { Finding } from "../audit/schema";
import type { RepositoryFile } from "./github";
import type { SourceIssue } from "./findings";

// Directories that hold third-party or generated code rather than project source.
export const ignoredDirectory =
  /(^|\/)(node_modules|vendor|bower_components|dist|build|out|\.next|\.nuxt|\.svelte-kit|coverage|target|__pycache__|\.venv|venv|\.git)\//;
export const sourceExtension =
  /\.(m?[jt]sx?|cjs|cts|mts|vue|svelte|astro|py|rb|php|go|java|kt|cs|rs|swift|scala|sh|sql)$/i;
const minified = /\.min\.(js|css)$|[-.]bundle\.js$|\.map$/i;
const testPath =
  /(^|\/)(tests?|__tests__|spec|fixtures?|examples?|mocks?|samples?|docs?)\/|\.(test|spec)\.[a-z]+$/i;

export function isAnalyzable(file: RepositoryFile) {
  return (
    file.text !== undefined &&
    !ignoredDirectory.test(file.path) &&
    !minified.test(file.path)
  );
}

interface PatternRule {
  id: string;
  title: string;
  category: Finding["category"];
  severity: Finding["severity"];
  confidence: number;
  pattern: RegExp;
  files?: RegExp;
  description: string;
  fix: string;
  secret?: boolean;
  // Extra confirmation over the surrounding lines, for rules prone to false positives.
  confirm?: (lines: string[], index: number, match: RegExpExecArray) => boolean;
}

// Real credentials mix letters and digits; words like "secret-value" do not.
function looksRandom(value: string) {
  return /[a-z]/i.test(value) && /\d/.test(value) && new Set(value).size >= 8;
}

const placeholder =
  /(example|sample|dummy|placeholder|changeme|your[_-]|xxx|<|\$\{|process\.env|os\.environ|getenv|import\.meta\.env|test|fake|redacted)/i;

export const secretRules: PatternRule[] = [
  {
    id: "private-key",
    title: "Private key committed to the repository",
    category: "security",
    severity: "critical",
    confidence: 0.95,
    pattern:
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/,
    confirm: (lines, index) =>
      lines
        .slice(index + 1, index + 4)
        .some((line) => /^[A-Za-z0-9+/=]{40,}$/.test(line.trim())),
    description:
      "A private key is stored in source control. Anyone with read access to the repository or its history can use it.",
    fix: "Revoke the key and issue a new one. Delete it from the full git history (git filter-repo or BFG). Load keys from a secret manager or environment variables at runtime.",
    secret: true,
  },
  {
    id: "aws-key",
    title: "AWS access key committed",
    category: "security",
    severity: "critical",
    confidence: 0.9,
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
    description:
      "An AWS access key ID appears in source. If its secret key is also present or leaked, the AWS account is exposed.",
    fix: "Deactivate the key in AWS IAM, rotate it, and remove it from git history. Use IAM roles or environment secrets instead.",
    secret: true,
  },
  {
    id: "github-token",
    title: "GitHub token committed",
    category: "security",
    severity: "critical",
    confidence: 0.95,
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/,
    description:
      "A GitHub access token appears in source and grants API access as its owner.",
    fix: "Revoke the token in GitHub settings, remove it from history, and provide it through CI secrets.",
    secret: true,
  },
  {
    id: "stripe-live",
    title: "Stripe live secret key committed",
    category: "security",
    severity: "critical",
    confidence: 0.95,
    pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/,
    description:
      "A live Stripe secret key appears in source. It can create charges, refunds and read customer data.",
    fix: "Roll the key in the Stripe dashboard immediately, remove it from history, and read it from a server-side secret.",
    secret: true,
  },
  {
    id: "ai-key",
    title: "AI provider API key committed",
    category: "security",
    severity: "high",
    confidence: 0.85,
    pattern:
      /\b(?:sk-ant-[A-Za-z0-9_-]{32,}|sk-proj-[A-Za-z0-9_-]{32,}|sk-[A-Za-z0-9]{40,})\b/,
    description:
      "An API key for a paid AI provider appears in source and can be used to run up charges.",
    fix: "Revoke the key with the provider, remove it from history, and load it from a server-side environment variable.",
    secret: true,
  },
  {
    id: "slack-token",
    title: "Slack token committed",
    category: "security",
    severity: "high",
    confidence: 0.9,
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
    description: "A Slack token appears in source.",
    fix: "Revoke the token in Slack, remove it from history, and store it as a secret.",
    secret: true,
  },
  {
    id: "google-key",
    title: "Google API key in source",
    category: "security",
    severity: "medium",
    confidence: 0.6,
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/,
    description:
      "A Google API key appears in source. Browser keys are sometimes public by design, but an unrestricted key can be abused.",
    fix: "Restrict the key by HTTP referrer and API in Google Cloud Console, or move it server-side and rotate it.",
    secret: true,
  },
  {
    id: "hardcoded-credential",
    title: "Hard-coded credential",
    category: "security",
    severity: "high",
    confidence: 0.55,
    pattern:
      /\b(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\b["']?\s*[:=]\s*["'`]([^"'`\s]{10,})["'`]/i,
    confirm: (_lines, _index, match) => looksRandom(match[1]),
    description: "A credential-like value is assigned directly in source.",
    fix: "Move the value to an environment variable or secret manager, rotate it if it was ever real, and remove it from history.",
    secret: true,
  },
];

export const codeRules: PatternRule[] = [
  {
    id: "tls-disabled",
    title: "TLS certificate verification disabled",
    category: "security",
    severity: "high",
    confidence: 0.9,
    pattern:
      /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0|verify\s*=\s*False|InsecureSkipVerify\s*:\s*true|CURLOPT_SSL_VERIFYPEER\s*,\s*(?:false|0)/,
    description:
      "Certificate verification is turned off, so connections accept any certificate and can be intercepted.",
    fix: "Remove the override. If a private CA is needed, configure its certificate explicitly (for example the `ca` option or REQUESTS_CA_BUNDLE).",
  },
  {
    id: "eval",
    title: "Dynamic code execution with eval",
    category: "security",
    severity: "high",
    confidence: 0.6,
    pattern:
      /(?<![.\w])eval\s*\(\s*(?!["'`][^"'`$]*["'`]\s*\))|new\s+Function\s*\(/,
    files: /\.(m?[jt]sx?|cjs|py|php|rb)$/i,
    description:
      "Code is evaluated from a runtime value. If any part is user-controlled this is remote code execution.",
    fix: "Replace eval/new Function with explicit parsing (JSON.parse, a lookup table, or a dedicated expression parser).",
  },
  {
    id: "command-injection",
    title: "Shell command built from interpolated input",
    category: "security",
    severity: "high",
    confidence: 0.65,
    pattern:
      /\b(?:exec|execSync|spawnSync|spawn)\s*\(\s*(?:`[^`]*\$\{|["'][^"']*["']\s*\+)|subprocess\.\w+\([^)]*shell\s*=\s*True|os\.system\s*\(\s*(?:f["']|[^)"']*\+)/,
    description:
      "A shell command is assembled from variables. Unescaped input can run arbitrary commands.",
    fix: "Use execFile/spawn with an argument array (or subprocess.run([...]) without shell=True) and validate inputs against an allow-list.",
  },
  {
    id: "sql-injection",
    title: "SQL query built with string interpolation",
    category: "security",
    severity: "high",
    confidence: 0.6,
    pattern:
      /\b(?:query|execute|exec|raw|prepare|unsafe)\s*\(\s*(?:`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b[^`]*\$\{|f["']\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b|["']\s*(?:SELECT|INSERT|UPDATE|DELETE)\b[^"']*["']\s*(?:\+|%))/i,
    description:
      "A SQL statement is built by inserting values into the query text, which allows SQL injection.",
    fix: "Use parameterized queries or the query builder's bindings ($1/?, named parameters) instead of string interpolation.",
  },
  {
    id: "unsafe-html",
    title: "Raw HTML injected into the page",
    category: "security",
    severity: "medium",
    confidence: 0.45,
    pattern:
      /dangerouslySetInnerHTML\s*=\s*\{\{\s*__html\s*:\s*(?!["'`])|\.(?:innerHTML|outerHTML)\s*=\s*(?!["'`]\s*;?$)[^;]*[\w)\]]|v-html\s*=|\{@html\s/,
    files: /\.(m?[jt]sx?|vue|svelte|html)$/i,
    description:
      "HTML from a variable is written into the DOM without escaping. Untrusted content here enables cross-site scripting.",
    fix: "Render text with framework escaping, or sanitize the HTML with DOMPurify (or an equivalent) before injecting it.",
  },
  {
    id: "unsafe-deserialization",
    title: "Unsafe deserialization",
    category: "security",
    severity: "high",
    confidence: 0.7,
    pattern:
      /\bpickle\.loads?\s*\(|\byaml\.load\s*\((?![^)]*Loader\s*=\s*(?:yaml\.)?SafeLoader)|\bunserialize\s*\(\s*\$_(?:GET|POST|REQUEST|COOKIE)|Marshal\.load\s*\(/,
    description:
      "Deserializing untrusted data with this API can execute arbitrary code.",
    fix: "Use a data-only format (JSON) or a safe loader (yaml.safe_load) and never deserialize user-supplied bytes with pickle/Marshal.",
  },
  {
    id: "weak-hash",
    title: "Weak hash algorithm used",
    category: "security",
    severity: "medium",
    confidence: 0.5,
    pattern:
      /createHash\(\s*["'](?:md5|sha1)["']\s*\)|hashlib\.(?:md5|sha1)\s*\(|\bmd5\s*\(\s*\$/i,
    description:
      "MD5/SHA-1 are broken for security purposes. If used for passwords, signatures or tokens they can be forged or cracked.",
    fix: "Use bcrypt, scrypt or Argon2 for passwords, and SHA-256 or HMAC-SHA-256 for integrity. Ignore if used only for non-security checksums.",
  },
  {
    id: "jwt-unverified",
    title: "JWT accepted without signature verification",
    category: "security",
    severity: "high",
    confidence: 0.7,
    pattern:
      /algorithms?\s*[:=]\s*\[?\s*["']none["']|verify_signature["']?\s*:\s*False|jwt\.decode\([^)]*verify\s*=\s*False/i,
    description:
      "Tokens are decoded without verifying their signature, so anyone can forge a session.",
    fix: 'Verify JWTs with jwt.verify / jwt.decode(..., algorithms=["HS256" or "RS256"]) and an explicit key; never allow the \'none\' algorithm.',
  },
  {
    id: "cors-wildcard",
    title: "CORS allows every origin",
    category: "security",
    severity: "medium",
    confidence: 0.5,
    pattern:
      /Access-Control-Allow-Origin["']?\s*[,:]\s*["']\*["']|origin\s*:\s*(?:["']\*["']|true)\s*[,}]|CORS_ALLOW_ALL_ORIGINS\s*=\s*True|allow_origins\s*=\s*\[\s*["']\*["']/,
    description:
      "Any website may call this API from a browser. Combined with cookies or credentials this exposes user data.",
    fix: "Restrict allowed origins to an explicit list of your own domains.",
  },
  {
    id: "debug-enabled",
    title: "Debug mode enabled in configuration",
    category: "security",
    severity: "medium",
    confidence: 0.5,
    pattern: /^\s*DEBUG\s*=\s*True\b|app\.run\([^)]*debug\s*=\s*True/,
    files: /\.py$/i,
    description:
      "Debug mode exposes stack traces, settings and sometimes an interactive console in production.",
    fix: "Read DEBUG from the environment and default it to False in production.",
  },
  {
    id: "public-secret-env",
    title: "Server secret exposed through a public environment variable",
    category: "security",
    severity: "high",
    confidence: 0.8,
    pattern:
      /\b(?:NEXT_PUBLIC|VITE|REACT_APP|NUXT_PUBLIC|PUBLIC|EXPO_PUBLIC)_[A-Z0-9_]*(?:SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|STRIPE_SK)[A-Z0-9_]*/,
    description:
      "Variables with this prefix are bundled into client JavaScript, so this secret is shipped to every visitor.",
    fix: "Rename the variable without the public prefix and read it only in server code (API routes, server actions, backend).",
  },
];

function scanLines(
  file: RepositoryFile,
  rules: PatternRule[],
  emit: (
    rule: PatternRule,
    line: number,
    text: string,
    match: RegExpExecArray,
  ) => void,
) {
  const lines = file.text!.split("\n");
  for (const rule of rules) {
    if (rule.files && !rule.files.test(file.path)) continue;
    lines.forEach((text, index) => {
      // Very long lines are minified or data blobs; they produce noise, not findings.
      if (text.length > 1000) return;
      const trimmed = text.trim();
      if (!rule.secret && /^(\/\/|#|\*|\/\*|<!--)/.test(trimmed)) return;
      const match = rule.pattern.exec(text);
      if (match && (!rule.confirm || rule.confirm(lines, index, match)))
        emit(rule, index + 1, text, match);
    });
  }
}

function maskSecret(line: string, match: RegExpExecArray) {
  const value = match[1] ?? match[0];
  const masked =
    value.length > 8
      ? value.slice(0, 4) + "•".repeat(Math.min(12, value.length - 4))
      : "•".repeat(value.length);
  return line.replace(value, masked).trim().slice(0, 300);
}

/** Line-level secret and dangerous-pattern detection across analyzable files. */
export function scanPatterns(files: RepositoryFile[]) {
  const issues: SourceIssue[] = [];
  const perRule = new Map<string, number>();
  const overflow = new Map<
    string,
    { rule: PatternRule; locations: string[] }
  >();
  for (const file of files) {
    if (!isAnalyzable(file)) continue;
    const isSource = sourceExtension.test(file.path);
    const isConfig =
      /(^|\/)(\.env[^/]*|[^/]*\.(ya?ml|json|toml|ini|cfg|conf|properties|xml|tf|tfvars)|Dockerfile[^/]*)$/i.test(
        file.path,
      );
    const rules = [
      ...(isSource || isConfig ? secretRules : secretRules.slice(0, 6)),
      ...(isSource ? codeRules : []),
    ];
    const inTests = testPath.test(file.path);
    scanLines(file, rules, (rule, line, text, match) => {
      if (rule.secret && placeholder.test(match[1] ?? match[0])) return;
      if (rule.id === "hardcoded-credential" && placeholder.test(text)) return;
      const count = (perRule.get(rule.id) ?? 0) + 1;
      perRule.set(rule.id, count);
      if (count > 15) {
        const group = overflow.get(rule.id) ?? { rule, locations: [] };
        group.locations.push(`${file.path}:${line}`);
        overflow.set(rule.id, group);
        return;
      }
      issues.push({
        title: rule.title,
        category: rule.category,
        // Hits in tests and fixtures are usually deliberate fakes; keep them visible but low.
        severity: inTests ? "low" : rule.severity,
        confidence: inTests ? rule.confidence * 0.5 : rule.confidence,
        path: file.path,
        line,
        description: inTests
          ? `${rule.description}\n\nFound in a test or example file: confirm this is a fake value.`
          : rule.description,
        snippet: rule.secret
          ? maskSecret(text, match)
          : text.trim().slice(0, 300),
        suggestedFix: rule.fix,
      });
    });
  }
  for (const { rule, locations } of overflow.values())
    issues.push({
      title: `${rule.title} (${locations.length} more occurrences)`,
      category: rule.category,
      severity: rule.severity,
      confidence: rule.confidence,
      path: locations[0].split(":")[0],
      description: `${rule.description}\n\nAdditional locations:\n${locations.slice(0, 60).join("\n")}`,
      suggestedFix: rule.fix,
    });
  return issues;
}

const pinnedAction = /@[0-9a-f]{40}\b/;

/** Repository-level checks: committed artifacts, build config, CI and container setup. */
export function scanConfiguration(files: RepositoryFile[]) {
  const issues: SourceIssue[] = [];
  const paths = new Set(files.map((file) => file.path));
  const has = (pattern: RegExp) =>
    files.some((file) => pattern.test(file.path));

  for (const file of files) {
    if (
      /(^|\/)\.env(\.[\w-]+)?$/.test(file.path) &&
      !/\.(example|sample|template|defaults?|dist)$/i.test(file.path) &&
      file.text &&
      /^\s*[A-Z0-9_]+\s*=\s*\S+/m.test(file.text)
    )
      issues.push({
        title: "Environment file with values committed",
        category: "security",
        severity: "high",
        confidence: 0.85,
        path: file.path,
        description:
          "An environment file containing assigned values is tracked by git. These usually hold credentials.",
        suggestedFix: `Delete ${file.path} from git (git rm --cached), add it to .gitignore, rotate any real secrets it contained, and commit a ${file.path}.example with empty values instead.`,
      });
  }
  const committedDependencies = files.find((file) =>
    /(^|\/)node_modules\//.test(file.path),
  );
  if (committedDependencies)
    issues.push({
      title: "node_modules is committed",
      category: "dependencies",
      severity: "medium",
      confidence: 1,
      path: committedDependencies.path.replace(
        /node_modules\/.*$/,
        "node_modules",
      ),
      description:
        "Installed dependencies are tracked in git. This bloats the repository and hides which versions actually run.",
      suggestedFix:
        "Run `git rm -r --cached node_modules`, add `node_modules/` to .gitignore, and rely on the lockfile.",
    });
  const large = files
    .filter(
      (file) =>
        file.size > 5 * 1024 * 1024 && !ignoredDirectory.test(file.path),
    )
    .slice(0, 10);
  for (const file of large)
    issues.push({
      title: `Large file committed (${Math.round(file.size / 1024 / 1024)} MB)`,
      category: "code",
      severity: "low",
      confidence: 1,
      path: file.path,
      description: "Large binary files slow every clone and cannot be diffed.",
      suggestedFix:
        "Move the file to Git LFS, object storage or a release asset, and remove it from history if it is not needed.",
    });

  // Node.js projects
  for (const manifest of files.filter(
    (file) =>
      /(^|\/)package\.json$/.test(file.path) &&
      !ignoredDirectory.test(file.path),
  )) {
    let pkg: {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
      workspaces?: unknown;
    };
    try {
      pkg = JSON.parse(manifest.text ?? "{}");
    } catch {
      issues.push({
        title: "package.json is not valid JSON",
        category: "reliability",
        severity: "high",
        confidence: 1,
        path: manifest.path,
        description:
          "The package manifest cannot be parsed, so installs and builds fail.",
        suggestedFix:
          "Fix the JSON syntax (trailing commas and comments are not allowed).",
      });
      continue;
    }
    const dir = manifest.path.includes("/")
      ? manifest.path.slice(0, manifest.path.lastIndexOf("/") + 1)
      : "";
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const hasLock = [
      "package-lock.json",
      "yarn.lock",
      "pnpm-lock.yaml",
      "bun.lockb",
      "bun.lock",
      "npm-shrinkwrap.json",
    ].some((lock) => paths.has(dir + lock) || paths.has(lock));
    if (Object.keys(deps).length && !hasLock)
      issues.push({
        title: "No dependency lockfile",
        category: "dependencies",
        severity: "medium",
        confidence: 0.9,
        path: manifest.path,
        description:
          "Without a lockfile every install can resolve different versions, so builds are not reproducible and vulnerable versions can appear silently.",
        suggestedFix:
          "Run `npm install` (or your package manager) and commit the generated lockfile. Use `npm ci` in CI.",
      });
    const floating = Object.entries(deps).filter(([, version]) =>
      /^(\*|latest|x|>=?\s*\d|)$/.test(version.trim()),
    );
    if (floating.length)
      issues.push({
        title: "Dependencies use unbounded version ranges",
        category: "dependencies",
        severity: "low",
        confidence: 0.9,
        path: manifest.path,
        description: `These dependencies accept any future version, including breaking or compromised releases: ${floating
          .map(([name, version]) => `${name}@"${version}"`)
          .join(", ")}.`,
        suggestedFix:
          'Pin each to a caret or exact range (for example "^1.2.3") and update deliberately.',
      });
    for (const [name, script] of Object.entries(pkg.scripts ?? {}))
      if (/(curl|wget)[^|]*\|\s*(ba|z)?sh/.test(script))
        issues.push({
          title: `npm script "${name}" pipes a download into a shell`,
          category: "security",
          severity: "high",
          confidence: 0.8,
          path: manifest.path,
          description: `The script runs remote code without verification: ${script.slice(0, 300)}`,
          suggestedFix:
            "Download to a file, verify its checksum or signature, then execute it, or install the tool from a package registry.",
        });
  }

  for (const tsconfig of files.filter(
    (file) =>
      /(^|\/)tsconfig\.json$/.test(file.path) &&
      !ignoredDirectory.test(file.path),
  ))
    if (tsconfig.text && /"strict"\s*:\s*false/.test(tsconfig.text))
      issues.push({
        title: "TypeScript strict mode is disabled",
        category: "code",
        severity: "low",
        confidence: 0.9,
        path: tsconfig.path,
        description:
          "With strict off, null/undefined errors and implicit any types are not caught at compile time.",
        suggestedFix:
          'Set "strict": true and fix the reported errors incrementally (or enable strictNullChecks first).',
      });

  // Containers
  for (const dockerfile of files.filter((file) =>
    /(^|\/)(Dockerfile[^/]*|[^/]+\.dockerfile)$/i.test(file.path),
  )) {
    const body = dockerfile.text ?? "";
    const stages = body.match(/^\s*FROM\s+\S+/gim) ?? [];
    const lastStage = body.slice(
      body.search(/^\s*FROM\s+(?![\s\S]*^\s*FROM\s)/im),
    );
    if (stages.length && !/^\s*USER\s+(?!root\b|0\b)\S+/im.test(lastStage))
      issues.push({
        title: "Container runs as root",
        category: "security",
        severity: "medium",
        confidence: 0.8,
        path: dockerfile.path,
        description:
          "The final image has no non-root USER, so a compromise of the app gives root inside the container.",
        suggestedFix:
          "Create an unprivileged user and add `USER <name>` before CMD/ENTRYPOINT (official Node images already include a `node` user).",
      });
    for (const from of stages) {
      const image = from.trim().split(/\s+/)[1];
      if (
        image &&
        image !== "scratch" &&
        !/\$\{?/.test(image) &&
        (!image.includes(":") || image.endsWith(":latest")) &&
        !image.includes("@sha256")
      )
        issues.push({
          title: `Base image ${image} is not pinned`,
          category: "reliability",
          severity: "low",
          confidence: 0.9,
          path: dockerfile.path,
          description:
            "Untagged or :latest images change underneath you, so builds are not reproducible.",
          suggestedFix: `Pin a specific version tag (and ideally a digest), for example ${image.replace(/:latest$/, "")}:<version>.`,
        });
    }
    const envSecret =
      /^\s*(?:ENV|ARG)\s+\w*(?:PASSWORD|SECRET|TOKEN|API_KEY)\w*[= ]\s*\S+/im.exec(
        body,
      );
    if (envSecret && !placeholder.test(envSecret[0]))
      issues.push({
        title: "Secret baked into the container image",
        category: "security",
        severity: "high",
        confidence: 0.7,
        path: dockerfile.path,
        description:
          "ENV/ARG values are stored in image layers and visible to anyone who can pull the image.",
        suggestedFix:
          "Pass secrets at runtime (environment or mounted secret) or use BuildKit `--mount=type=secret` during builds.",
      });
  }

  // GitHub Actions
  const workflows = files.filter((file) =>
    /^\.github\/workflows\/[^/]+\.ya?ml$/.test(file.path),
  );
  const unpinned: string[] = [];
  for (const workflow of workflows) {
    const body = workflow.text ?? "";
    if (
      /pull_request_target/.test(body) &&
      /ref:\s*\$\{\{\s*github\.event\.pull_request\.head\.(sha|ref)/.test(body)
    )
      issues.push({
        title: "pull_request_target checks out untrusted pull request code",
        category: "security",
        severity: "critical",
        confidence: 0.85,
        path: workflow.path,
        description:
          "This workflow runs with repository secrets and write access while executing code from a fork's pull request. Any external contributor can steal secrets or push to the repository.",
        suggestedFix:
          "Use the `pull_request` trigger for building untrusted code, or split into an unprivileged build job and a separate privileged job that only consumes artifacts.",
      });
    body.split("\n").forEach((line, index) => {
      if (
        /\$\{\{\s*github\.event\.(issue|pull_request|comment|review|review_comment|discussion|head_commit|commits)[^}]*(title|body|message|name|label|ref|email)\s*\}\}/.test(
          line,
        ) &&
        !/^\s*(if:|name:|#)/.test(line)
      )
        issues.push({
          title: "Workflow interpolates untrusted event text into a script",
          category: "security",
          severity: "high",
          confidence: 0.7,
          path: workflow.path,
          line: index + 1,
          snippet: line.trim().slice(0, 300),
          description:
            "Attacker-controlled text (titles, bodies, branch names) is substituted directly into a shell step, allowing command injection in CI.",
          suggestedFix:
            'Pass the value through an environment variable (env: TITLE: ${{ github.event.issue.title }}) and reference "$TITLE" in the script.',
        });
      const uses = /^\s*-?\s*uses:\s*([^\s#]+)/.exec(line);
      if (
        uses &&
        !uses[1].startsWith("./") &&
        !uses[1].startsWith("docker://") &&
        !pinnedAction.test(uses[1]) &&
        !/^actions\//.test(uses[1])
      )
        unpinned.push(`${workflow.path}:${index + 1} ${uses[1]}`);
    });
    if (!/^\s*permissions\s*:/m.test(body))
      issues.push({
        title: "Workflow does not restrict GITHUB_TOKEN permissions",
        category: "security",
        severity: "low",
        confidence: 0.7,
        path: workflow.path,
        description:
          "Without a permissions block the token may have broad write access depending on repository settings.",
        suggestedFix:
          "Add `permissions: contents: read` at the top level and grant extra scopes only to jobs that need them.",
      });
  }
  if (unpinned.length)
    issues.push({
      title: "Third-party GitHub Actions are not pinned to a commit",
      category: "security",
      severity: "low",
      confidence: 0.9,
      path: unpinned[0].split(":")[0],
      description: `Tags can be moved by the action's owner, so a compromised action changes your CI silently:\n${unpinned.slice(0, 30).join("\n")}`,
      suggestedFix:
        "Pin third-party actions to a full commit SHA (uses: owner/action@<sha> # v1.2.3) and update them with Dependabot.",
    });

  // Project hygiene
  const hasSource = files.some(
    (file) =>
      sourceExtension.test(file.path) && !ignoredDirectory.test(file.path),
  );
  if (hasSource) {
    if (
      !workflows.length &&
      !has(
        /^(\.gitlab-ci\.yml|\.circleci\/|azure-pipelines\.yml|Jenkinsfile|\.travis\.yml|bitbucket-pipelines\.yml|\.buildkite\/)/,
      )
    )
      issues.push({
        title: "No continuous integration configured",
        category: "code",
        severity: "low",
        confidence: 0.8,
        path: "",
        description:
          "Nothing runs tests, type checks or linting on each push, so regressions reach the main branch unnoticed.",
        suggestedFix:
          "Add a CI workflow (for example .github/workflows/ci.yml) that installs dependencies and runs lint, type check and tests on every push and pull request.",
      });
    if (!has(testPath) && !has(/(^|\/)test_[^/]+\.py$|_test\.go$|Test\.java$/))
      issues.push({
        title: "No automated tests found",
        category: "code",
        severity: "medium",
        confidence: 0.7,
        path: "",
        description:
          "No test files or test directories were found, so behavior changes cannot be verified automatically.",
        suggestedFix:
          "Add a test runner (Vitest/Jest, pytest, go test) and start with tests for the most critical paths: authentication, payments and data writes.",
      });
    if (!paths.has(".gitignore"))
      issues.push({
        title: "Repository has no .gitignore",
        category: "code",
        severity: "low",
        confidence: 0.9,
        path: "",
        description:
          "Without a .gitignore, build output, dependencies and local environment files are easy to commit by accident.",
        suggestedFix:
          "Add a .gitignore for your stack (see github.com/github/gitignore) that excludes dependencies, build output and .env files.",
      });
    if (!has(/^readme(\.\w+)?$/i))
      issues.push({
        title: "Repository has no README",
        category: "code",
        severity: "info",
        confidence: 1,
        path: "",
        description:
          "There is no top-level README explaining how to install, run and deploy the project.",
        suggestedFix:
          "Add a README.md with setup, configuration, test and deployment instructions.",
      });
  }
  return issues;
}
