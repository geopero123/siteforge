import { z } from "zod";
import type { AIProvider } from "../ai/provider";
import type { Finding } from "../audit/schema";
import { redactSecrets } from "../security/redact";
export const repositorySchema = z
  .string()
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "Use owner/repository");

async function fetchGitHubJson(path: string, token?: string) {
  const response = await fetch("https://api.github.com/" + path, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error(
      `GitHub API ${response.status}: check repository visibility and worker token permissions.`,
    );
  return response.json() as Promise<unknown>;
}
export async function investigateRepository(
  ai: AIProvider,
  repository: string,
  findings: Finding[],
  userId?: string,
) {
  repositorySchema.parse(repository);
  // A worker token is available only to its configured user and repositories.
  const allowedRepositories = (process.env.GITHUB_REPOSITORIES ?? "")
    .split(",")
    .map((repositoryName) => repositoryName.trim().toLowerCase());
  const token =
    userId &&
    userId === process.env.GITHUB_TOKEN_USER_ID &&
    allowedRepositories.includes(repository.toLowerCase())
      ? process.env.GITHUB_TOKEN
      : undefined;
  const repositoryMetadata = (await fetchGitHubJson(
    `repos/${repository}`,
    token,
  )) as {
    default_branch: string;
  };
  const tree = (await fetchGitHubJson(
    `repos/${repository}/git/trees/${encodeURIComponent(repositoryMetadata.default_branch)}?recursive=1`,
    token,
  )) as {
    tree: Array<{ path: string; type: string; size?: number }>;
    truncated: boolean;
  };
  // Keep a bounded index of source files for the model to choose from.
  const sourcePaths = tree.tree
    .filter(
      (entry) =>
        entry.type === "blob" &&
        /\.(tsx?|jsx?|css|html)$/.test(entry.path) &&
        !/(node_modules|vendor|\.env|lock)/.test(entry.path) &&
        (!entry.size || entry.size < 25000),
    )
    .slice(0, 1200)
    .map((entry) => entry.path);
  const selection = await ai.generateStructured(
    `Select up to 4 likely source files to investigate these findings. Only select exact paths from the repository index. Findings: ${JSON.stringify(findings.slice(0, 8))}. Index: ${JSON.stringify(sourcePaths)}`,
    z.object({ paths: z.array(z.string()).max(4) }),
  );
  // Validate model-selected paths against the index before fetching their contents.
  const files = [];
  for (const path of selection.paths.filter((path) =>
    sourcePaths.includes(path),
  )) {
    const file = (await fetchGitHubJson(
      `repos/${repository}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(repositoryMetadata.default_branch)}`,
      token,
    )) as { content?: string; encoding: string };
    if (file.encoding === "base64" && file.content)
      files.push({
        path,
        content: redactSecrets(
          Buffer.from(file.content, "base64").toString("utf8").slice(0, 20000),
        ),
      });
  }
  return {
    files,
    branch: repositoryMetadata.default_branch,
    truncated: tree.truncated,
  };
}
