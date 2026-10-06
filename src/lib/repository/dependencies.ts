import type { Finding } from "../audit/schema";
import type { RepositoryFile } from "./github";
import type { SourceIssue } from "./findings";
import { ignoredDirectory } from "./rules";

export interface Dependency {
  ecosystem: "npm" | "PyPI" | "Go" | "crates.io" | "RubyGems" | "Packagist";
  name: string;
  version: string;
  file: string;
  dev?: boolean;
  direct?: boolean;
}

function npmLock(file: RepositoryFile): Dependency[] {
  const lock = JSON.parse(file.text!) as {
    packages?: Record<
      string,
      { version?: string; dev?: boolean; link?: boolean }
    >;
    dependencies?: Record<
      string,
      { version?: string; dev?: boolean; dependencies?: unknown }
    >;
  };
  const root = lock.packages?.[""] as
    { dependencies?: object; devDependencies?: object } | undefined;
  const direct = new Set(
    Object.keys({ ...root?.dependencies, ...root?.devDependencies }),
  );
  const out: Dependency[] = [];
  if (lock.packages) {
    for (const [key, entry] of Object.entries(lock.packages)) {
      if (!key || entry.link || !entry.version) continue;
      const name = key.slice(key.lastIndexOf("node_modules/") + 13);
      out.push({
        ecosystem: "npm",
        name,
        version: entry.version,
        file: file.path,
        dev: entry.dev,
        direct: direct.has(name) && key === "node_modules/" + name,
      });
    }
    return out;
  }
  const walk = (deps: typeof lock.dependencies, top: boolean) => {
    for (const [name, entry] of Object.entries(deps ?? {})) {
      if (entry.version && /^\d/.test(entry.version))
        out.push({
          ecosystem: "npm",
          name,
          version: entry.version,
          file: file.path,
          dev: entry.dev,
          direct: top,
        });
      walk(entry.dependencies as typeof lock.dependencies, false);
    }
  };
  walk(lock.dependencies, true);
  return out;
}

function yarnLock(file: RepositoryFile): Dependency[] {
  const out: Dependency[] = [];
  // Yarn v1 and berry: a quoted or bare spec header followed by a version line.
  const pattern =
    /^"?(@?[^@\s"]+)@[^\n]*:\n(?:[ \t]+[^\n]*\n)*?[ \t]+version:? "?([^"\s]+)"?/gm;
  for (const match of file.text!.matchAll(pattern))
    out.push({
      ecosystem: "npm",
      name: match[1],
      version: match[2],
      file: file.path,
    });
  return out;
}

function pnpmLock(file: RepositoryFile): Dependency[] {
  const out: Dependency[] = [];
  const section =
    file.text!.split(/^packages:\s*$/m)[1]?.split(/^\S/m)[0] ?? "";
  for (const match of section.matchAll(
    /^ {2}'?\/?(@?[^@\s'(]+)[@/]([0-9][^:'(\s]*)/gm,
  ))
    out.push({
      ecosystem: "npm",
      name: match[1],
      version: match[2],
      file: file.path,
    });
  return out;
}

function requirements(file: RepositoryFile): Dependency[] {
  const out: Dependency[] = [];
  for (const match of file.text!.matchAll(
    /^\s*([A-Za-z0-9._-]+)(?:\[[^\]]*\])?\s*==\s*([A-Za-z0-9._+-]+)/gm,
  ))
    out.push({
      ecosystem: "PyPI",
      name: match[1],
      version: match[2],
      file: file.path,
      direct: true,
    });
  return out;
}

function tomlPackages(
  file: RepositoryFile,
  ecosystem: Dependency["ecosystem"],
): Dependency[] {
  const out: Dependency[] = [];
  for (const block of file.text!.split(/^\[\[package\]\]\s*$/m).slice(1)) {
    const name = /^name\s*=\s*"([^"]+)"/m.exec(block)?.[1];
    const version = /^version\s*=\s*"([^"]+)"/m.exec(block)?.[1];
    if (name && version)
      out.push({ ecosystem, name, version, file: file.path });
  }
  return out;
}

function pipfileLock(file: RepositoryFile): Dependency[] {
  const lock = JSON.parse(file.text!) as Record<
    string,
    Record<string, { version?: string }>
  >;
  const out: Dependency[] = [];
  for (const [section, dev] of [
    ["default", false],
    ["develop", true],
  ] as const)
    for (const [name, entry] of Object.entries(lock[section] ?? {}))
      if (entry.version?.startsWith("=="))
        out.push({
          ecosystem: "PyPI",
          name,
          version: entry.version.slice(2),
          file: file.path,
          dev,
        });
  return out;
}

function goMod(file: RepositoryFile): Dependency[] {
  const out: Dependency[] = [];
  for (const match of file.text!.matchAll(
    /^\s*(?:require\s+)?([a-z0-9.-]+\.[a-z]{2,}\/[^\s]+)\s+(v[0-9][^\s]*)/gm,
  ))
    out.push({
      ecosystem: "Go",
      name: match[1],
      version: match[2],
      file: file.path,
      direct: !/\/\/ indirect/.test(match[0]),
    });
  return out;
}

function gemfileLock(file: RepositoryFile): Dependency[] {
  const out: Dependency[] = [];
  const specs =
    file.text!.split(/^\s{2}specs:\s*$/m)[1]?.split(/^\S/m)[0] ?? "";
  for (const match of specs.matchAll(
    /^ {4}([A-Za-z0-9._-]+) \(([0-9][^)\s-]*)[^)]*\)/gm,
  ))
    out.push({
      ecosystem: "RubyGems",
      name: match[1],
      version: match[2],
      file: file.path,
    });
  return out;
}

function composerLock(file: RepositoryFile): Dependency[] {
  const lock = JSON.parse(file.text!) as Record<
    string,
    Array<{ name: string; version: string }>
  >;
  return [
    ...(lock.packages ?? []).map((p) => ({ ...p, dev: false })),
    ...(lock["packages-dev"] ?? []).map((p) => ({ ...p, dev: true })),
  ].map((p) => ({
    ecosystem: "Packagist" as const,
    name: p.name,
    version: p.version.replace(/^v/, ""),
    file: file.path,
    dev: p.dev,
  }));
}

const parsers: Array<[RegExp, (file: RepositoryFile) => Dependency[]]> = [
  [/(^|\/)(package-lock|npm-shrinkwrap)\.json$/, npmLock],
  [/(^|\/)yarn\.lock$/, yarnLock],
  [/(^|\/)pnpm-lock\.yaml$/, pnpmLock],
  [/(^|\/)requirements[^/]*\.txt$/, requirements],
  [/(^|\/)poetry\.lock$/, (f) => tomlPackages(f, "PyPI")],
  [/(^|\/)uv\.lock$/, (f) => tomlPackages(f, "PyPI")],
  [/(^|\/)Pipfile\.lock$/, pipfileLock],
  [/(^|\/)Cargo\.lock$/, (f) => tomlPackages(f, "crates.io")],
  [/(^|\/)go\.mod$/, goMod],
  [/(^|\/)Gemfile\.lock$/, gemfileLock],
  [/(^|\/)composer\.lock$/, composerLock],
];

export function collectDependencies(files: RepositoryFile[]) {
  const dependencies: Dependency[] = [];
  const errors: string[] = [];
  for (const file of files) {
    if (!file.text || ignoredDirectory.test(file.path)) continue;
    const parser = parsers.find(([pattern]) => pattern.test(file.path))?.[1];
    if (!parser) continue;
    try {
      dependencies.push(...parser(file));
    } catch {
      errors.push(`Could not parse ${file.path}`);
    }
  }
  // One query per package version; keep the first manifest that mentions it.
  const unique = new Map<string, Dependency>();
  for (const dependency of dependencies) {
    const key = `${dependency.ecosystem}|${dependency.name}|${dependency.version}`;
    const existing = unique.get(key);
    if (!existing) unique.set(key, dependency);
    else if (existing.dev && !dependency.dev)
      unique.set(key, {
        ...dependency,
        direct: existing.direct || dependency.direct,
      });
  }
  return { dependencies: [...unique.values()], errors };
}

interface OsvVulnerability {
  id: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  severity?: Array<{ type: string; score: string }>;
  database_specific?: { severity?: string };
  affected?: Array<{
    package?: { name: string; ecosystem: string };
    ranges?: Array<{
      events: Array<{
        introduced?: string;
        fixed?: string;
        last_affected?: string;
      }>;
    }>;
    database_specific?: { severity?: string };
  }>;
}

function compareVersions(a: string, b: string) {
  const parse = (v: string) =>
    v
      .replace(/^v/, "")
      .split(/[.+-]/)
      .map((part) => (/^\d+$/.test(part) ? Number(part) : part));
  const left = parse(a),
    right = parse(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const x = left[i] ?? 0,
      y = right[i] ?? 0;
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return x - y;
    return String(x).localeCompare(String(y));
  }
  return 0;
}

const severityOrder: Finding["severity"][] = [
  "info",
  "low",
  "medium",
  "high",
  "critical",
];

function cvssBaseSeverity(vector: string): Finding["severity"] | undefined {
  // Approximate CVSS v3 base severity from impact metrics when no label is given.
  if (!vector.startsWith("CVSS:3")) return undefined;
  const metric = (name: string) =>
    new RegExp(`/${name}:([A-Z])`).exec(vector)?.[1];
  const impacts = ["C", "I", "A"].map(metric).filter((v) => v === "H").length;
  const network = metric("AV") === "N" && metric("PR") === "N";
  if (impacts >= 2 && network) return "critical";
  if (impacts >= 1) return "high";
  return "medium";
}

function vulnerabilitySeverity(vuln: OsvVulnerability): Finding["severity"] {
  const label = (
    vuln.database_specific?.severity ??
    vuln.affected?.find((a) => a.database_specific?.severity)?.database_specific
      ?.severity ??
    ""
  ).toUpperCase();
  if (label === "CRITICAL") return "critical";
  if (label === "HIGH") return "high";
  if (label === "MODERATE" || label === "MEDIUM") return "medium";
  if (label === "LOW") return "low";
  const vector = vuln.severity?.find((s) =>
    s.type.startsWith("CVSS_V3"),
  )?.score;
  return (vector && cvssBaseSeverity(vector)) || "medium";
}

function rangeEvents(vuln: OsvVulnerability, dependency: Dependency) {
  return (vuln.affected ?? [])
    .filter(
      (a) => a.package?.name.toLowerCase() === dependency.name.toLowerCase(),
    )
    .flatMap((a) => a.ranges ?? [])
    .flatMap((r) => r.events);
}

function fixedVersion(vuln: OsvVulnerability, dependency: Dependency) {
  return rangeEvents(vuln, dependency)
    .map((e) => e.fixed)
    .filter(
      (fixed): fixed is string =>
        !!fixed && compareVersions(fixed, dependency.version) > 0,
    )
    .sort(compareVersions)[0];
}

// Some advisories only name the last vulnerable release instead of a fixed one.
function lastAffected(vuln: OsvVulnerability, dependency: Dependency) {
  return rangeEvents(vuln, dependency)
    .map((e) => e.last_affected)
    .filter(
      (last): last is string =>
        !!last && compareVersions(last, dependency.version) >= 0,
    )
    .sort(compareVersions)
    .at(-1);
}

function upgradeCommand(dependency: Dependency, version: string) {
  switch (dependency.ecosystem) {
    case "npm":
      return dependency.direct
        ? `npm install ${dependency.name}@${version}`
        : `npm update ${dependency.name} (or add an "overrides" entry: "${dependency.name}": "${version}")`;
    case "PyPI":
      return `pip install "${dependency.name}>=${version}" and update the pinned version`;
    case "Go":
      return `go get ${dependency.name}@${version} && go mod tidy`;
    case "crates.io":
      return `cargo update -p ${dependency.name} --precise ${version}`;
    case "RubyGems":
      return `bundle update ${dependency.name}`;
    case "Packagist":
      return `composer require ${dependency.name}:^${version}`;
  }
}

async function postJson(url: string, body: unknown, signal?: AbortSignal) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
      : AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(`OSV request failed with HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

/** Looks up known vulnerabilities for locked dependency versions on OSV.dev. */
export async function scanDependencies(
  dependencies: Dependency[],
  signal?: AbortSignal,
  maxDetails = 200,
): Promise<SourceIssue[]> {
  if (!dependencies.length) return [];
  const affected: Array<{ dependency: Dependency; ids: string[] }> = [];
  for (let i = 0; i < dependencies.length; i += 1000) {
    const batch = dependencies.slice(i, i + 1000);
    const result = (await postJson(
      "https://api.osv.dev/v1/querybatch",
      {
        queries: batch.map((d) => ({
          package: { name: d.name, ecosystem: d.ecosystem },
          version: d.version,
        })),
      },
      signal,
    )) as { results: Array<{ vulns?: Array<{ id: string }> }> };
    result.results.forEach((r, index) => {
      if (r.vulns?.length)
        affected.push({
          dependency: batch[index],
          ids: r.vulns.map((v) => v.id),
        });
    });
  }
  const ids = [...new Set(affected.flatMap((a) => a.ids))].slice(0, maxDetails);
  const details = new Map<string, OsvVulnerability>();
  for (let i = 0; i < ids.length; i += 8) {
    await Promise.all(
      ids.slice(i, i + 8).map(async (id) => {
        const response = await fetch(
          `https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`,
          {
            signal: signal
              ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
              : AbortSignal.timeout(15000),
          },
        );
        if (response.ok)
          details.set(id, (await response.json()) as OsvVulnerability);
      }),
    );
  }
  return affected.map(({ dependency, ids }) => {
    const vulns = ids.map((id) => details.get(id) ?? { id });
    let severity = vulns
      .map(vulnerabilitySeverity)
      .reduce(
        (a, b) =>
          severityOrder.indexOf(a) >= severityOrder.indexOf(b) ? a : b,
        "low",
      );
    // Development-only packages do not ship to users; lower their priority one step.
    if (dependency.dev && severity !== "info")
      severity =
        severityOrder[Math.max(1, severityOrder.indexOf(severity) - 1)];
    const fixes = vulns
      .map((v) => fixedVersion(v, dependency))
      .filter(Boolean) as string[];
    const target = fixes.sort(compareVersions).at(-1);
    const unfixed = vulns.filter((v) => !fixedVersion(v, dependency));
    const lastVulnerable = unfixed
      .map((v) => lastAffected(v, dependency))
      .filter(Boolean)
      .sort((a, b) => compareVersions(a!, b!))
      .at(-1);
    const names = vulns
      .map((v) => {
        const cve = v.aliases?.find((a) => a.startsWith("CVE-"));
        return `- ${v.id}${cve ? ` (${cve})` : ""}: ${v.summary ?? "see advisory"}`;
      })
      .join("\n");
    return {
      title: `${dependency.name}@${dependency.version} has ${vulns.length} known ${vulns.length === 1 ? "vulnerability" : "vulnerabilities"}`,
      category: "dependencies",
      severity,
      confidence: 0.95,
      path: dependency.file,
      evidenceType: "dependency",
      snippet: `${dependency.ecosystem} ${dependency.name} ${dependency.version}${dependency.dev ? " (development)" : ""}${dependency.direct === false ? " (transitive)" : ""}`,
      description: `Advisories from OSV.dev:\n${names}`.slice(0, 5000),
      suggestedFix:
        target && !unfixed.length
          ? `Upgrade ${dependency.name} to ${target} or later: ${upgradeCommand(dependency, target)}. Then run your tests and commit the updated lockfile.`
          : lastVulnerable
            ? `Upgrade ${dependency.name} to a release newer than ${lastVulnerable} (the last affected version)${target ? `, at least ${target}` : ""}${dependency.direct === false ? "; it is a transitive dependency, so update the package that requires it or add an override" : ""}. Then run your tests and commit the updated lockfile.`
            : target
              ? `Upgrade ${dependency.name} to ${target} or later to fix ${vulns.length - unfixed.length} of these advisories (${upgradeCommand(dependency, target)}). The rest have no fixed release yet: check whether the vulnerable code path is used.`
              : `No fixed release is listed yet. Review the advisories, check whether the vulnerable code path is used, and consider replacing ${dependency.name}.`,
    } satisfies SourceIssue;
  });
}
