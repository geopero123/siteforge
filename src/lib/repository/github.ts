import { gunzipSync } from "node:zlib";
import { readTar } from "./tar";
import type { RepositoryReference } from "./reference";

const maxArchiveBytes = 60 * 1024 * 1024;
const maxExtractedBytes = 250 * 1024 * 1024;
// Files above this size are indexed but not read; generated bundles dominate it.
export const maxAnalyzedFileBytes = 400 * 1024;

export interface RepositoryFile {
  path: string;
  size: number;
  text?: string;
}

export interface RepositorySnapshot {
  reference: RepositoryReference;
  branch: string;
  commit?: string;
  files: RepositoryFile[];
  truncated: boolean;
}

// The private token serves only its configured user and repositories. Everyone
// else shares GITHUB_PUBLIC_TOKEN (public repositories only) or no token at all,
// which GitHub limits to 60 requests an hour per worker.
export function tokenFor(reference: RepositoryReference, userId?: string) {
  const allowed = (process.env.GITHUB_REPOSITORIES ?? "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  const name = `${reference.owner}/${reference.repo}`.toLowerCase();
  if (
    userId &&
    userId === process.env.GITHUB_TOKEN_USER_ID &&
    allowed.includes(name)
  )
    return { token: process.env.GITHUB_TOKEN, publicOnly: false };
  return {
    token: process.env.GITHUB_PUBLIC_TOKEN || undefined,
    publicOnly: true,
  };
}

function headers(token?: string) {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "SiteForge",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchGitHubJson(path: string, token?: string) {
  const response = await fetch("https://api.github.com/" + path, {
    headers: headers(token),
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 404)
    throw new Error(
      "GitHub repository or branch not found. Private repositories need an authorized worker token.",
    );
  if (
    response.status === 429 ||
    (response.status === 403 &&
      response.headers.get("x-ratelimit-remaining") === "0")
  )
    throw new Error(
      "GitHub rate limit reached. Configure GITHUB_PUBLIC_TOKEN on the worker or retry later.",
    );
  if (response.status === 403 || response.status === 401)
    throw new Error(
      "GitHub refused access to this repository. Private repositories need an authorized worker token, and the worker's network must allow api.github.com and codeload.github.com.",
    );
  if (!response.ok)
    throw new Error(
      `GitHub API ${response.status}: check repository visibility and worker token permissions.`,
    );
  return response.json() as Promise<unknown>;
}

async function readLimited(response: Response, limit: number) {
  const declared = Number(response.headers.get("content-length"));
  if (declared > limit)
    throw new Error("Repository archive is too large to scan");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("GitHub returned an empty archive");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new Error("Repository archive is too large to scan");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function isProbablyText(content: Buffer) {
  return !content.subarray(0, 8000).includes(0);
}

/** Downloads one archive of the repository and returns its file index and text. */
export async function fetchRepositorySnapshot(
  reference: RepositoryReference,
  userId?: string,
  signal?: AbortSignal,
): Promise<RepositorySnapshot> {
  const { token, publicOnly } = tokenFor(reference, userId);
  const base = `repos/${reference.owner}/${reference.repo}`;
  const metadata = (await fetchGitHubJson(base, token)) as {
    default_branch: string;
    private?: boolean;
  };
  // The shared token must never expose private code, even if it was created
  // with more access than public repositories.
  if (publicOnly && metadata.private)
    throw new Error(
      "GitHub repository or branch not found. Private repositories need an authorized worker token.",
    );
  const branch = reference.ref ?? metadata.default_branch;
  const commit = (await fetchGitHubJson(
    `${base}/commits/${encodeURIComponent(branch)}`,
    token,
  ).catch(() => undefined)) as { sha?: string } | undefined;
  const response = await fetch(
    `https://api.github.com/${base}/tarball/${encodeURIComponent(commit?.sha ?? branch)}`,
    {
      headers: headers(token),
      redirect: "follow",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(120000)])
        : AbortSignal.timeout(120000),
    },
  );
  if (!response.ok)
    throw new Error(
      `GitHub archive download failed with HTTP ${response.status}`,
    );
  const archive = gunzipSync(await readLimited(response, maxArchiveBytes), {
    maxOutputLength: maxExtractedBytes,
  });
  const entries = readTar(
    archive,
    (_path, size) => size <= maxAnalyzedFileBytes,
  );
  const files: RepositoryFile[] = [];
  for (const entry of entries) {
    // GitHub wraps the tree in a single "<owner>-<repo>-<sha>/" directory.
    const path = entry.path.split("/").slice(1).join("/");
    if (!path) continue;
    files.push({
      path,
      size: entry.size,
      ...(entry.content && isProbablyText(entry.content)
        ? { text: entry.content.toString("utf8") }
        : {}),
    });
  }
  return {
    reference,
    branch,
    commit: commit?.sha,
    files,
    truncated: entries.length >= 30000,
  };
}
