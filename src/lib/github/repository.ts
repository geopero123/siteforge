import { z } from "zod";
import type { AIProvider } from "../ai/provider";
import type { Finding } from "../audit/schema";
import { redactSecrets } from "../security/redact";
export const repositorySchema = z
  .string()
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "Use owner/repository");
async function github(path: string, token?: string) {
  const r = await fetch("https://api.github.com/" + path, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok)
    throw new Error(
      `GitHub API ${r.status}: check repository visibility and worker token permissions.`,
    );
  return r.json() as Promise<unknown>;
}
export async function investigateRepository(
  ai: AIProvider,
  repository: string,
  findings: Finding[],
  userId?: string,
) {
  repositorySchema.parse(repository);
  const allowed = (process.env.GITHUB_REPOSITORIES ?? "")
    .split(",")
    .map((r) => r.trim().toLowerCase());
  const token =
    userId &&
    userId === process.env.GITHUB_TOKEN_USER_ID &&
    allowed.includes(repository.toLowerCase())
      ? process.env.GITHUB_TOKEN
      : undefined;
  const meta = (await github(`repos/${repository}`, token)) as {
    default_branch: string;
  };
  const tree = (await github(
    `repos/${repository}/git/trees/${encodeURIComponent(meta.default_branch)}?recursive=1`,
    token,
  )) as {
    tree: Array<{ path: string; type: string; size?: number }>;
    truncated: boolean;
  };
  const paths = tree.tree
    .filter(
      (x) =>
        x.type === "blob" &&
        /\.(tsx?|jsx?|css|html)$/.test(x.path) &&
        !/(node_modules|vendor|\.env|lock)/.test(x.path) &&
        (!x.size || x.size < 25000),
    )
    .slice(0, 1200)
    .map((x) => x.path);
  const selection = await ai.generateStructured(
    `Select up to 4 likely source files to investigate these findings. Only select exact paths from the repository index. Findings: ${JSON.stringify(findings.slice(0, 8))}. Index: ${JSON.stringify(paths)}`,
    z.object({ paths: z.array(z.string()).max(4) }),
  );
  const files = [];
  for (const path of selection.paths.filter((p) => paths.includes(p))) {
    const file = (await github(
      `repos/${repository}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(meta.default_branch)}`,
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
  return { files, branch: meta.default_branch, truncated: tree.truncated };
}
