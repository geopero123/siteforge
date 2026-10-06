import { z } from "zod";
import type { AIProvider } from "../ai/provider";
import type { Finding } from "../audit/schema";
import type { RepositorySnapshot } from "../repository/github";
import { isAnalyzable } from "../repository/rules";
import { redactSecrets } from "../security/redact";
export { repositoryReferenceSchema as repositorySchema } from "../repository/reference";

/** Picks the source files most likely behind website findings, from a fetched snapshot. */
export async function investigateRepository(
  ai: AIProvider,
  snapshot: RepositorySnapshot,
  findings: Finding[],
) {
  // Keep a bounded index of source files for the model to choose from.
  const sourcePaths = snapshot.files
    .filter(
      (file) =>
        isAnalyzable(file) &&
        /\.(tsx?|jsx?|vue|svelte|astro|css|scss|html|php|erb|py)$/.test(
          file.path,
        ) &&
        file.size < 60000,
    )
    .slice(0, 1500)
    .map((file) => file.path);
  const selection = await ai.generateStructured(
    `Select up to 6 likely source files to investigate these website findings. Only select exact paths from the repository index. Findings: ${JSON.stringify(findings.slice(0, 10))}. Index: ${JSON.stringify(sourcePaths)}`,
    z.object({ paths: z.array(z.string()).max(6) }),
  );
  // Validate model-selected paths against the index before using their contents.
  const allowed = new Set(sourcePaths);
  const files = snapshot.files
    .filter(
      (file) => allowed.has(file.path) && selection.paths.includes(file.path),
    )
    .map((file) => ({
      path: file.path,
      content: redactSecrets(file.text!.slice(0, 20000)),
    }));
  return { files, branch: snapshot.branch };
}
