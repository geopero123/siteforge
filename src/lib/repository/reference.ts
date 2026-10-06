import { z } from "zod";

export interface RepositoryReference {
  owner: string;
  repo: string;
  ref?: string;
}

const name = /^[A-Za-z0-9_.-]{1,100}$/;
// Branch and tag names: no traversal, whitespace or git-forbidden characters.
const refPattern = /^(?!.*\.\.)(?!\/)(?!.*\/$)[A-Za-z0-9._\/-]{1,200}$/;

// Accepts owner/repo, owner/repo#ref, or a github.com URL (optionally /tree/ref).
export function parseRepository(raw: string): RepositoryReference {
  const input = raw.trim();
  let owner: string | undefined,
    repo: string | undefined,
    ref: string | undefined;
  if (/^(https?:\/\/)?(www\.)?github\.com\//i.test(input)) {
    const url = new URL(/^https?:/i.test(input) ? input : "https://" + input);
    const parts = url.pathname.split("/").filter(Boolean);
    [owner, repo] = parts;
    if (parts[2] === "tree" && parts.length > 3)
      ref = decodeURIComponent(parts.slice(3).join("/"));
  } else {
    const match = /^([^/#\s]+)\/([^/#\s]+)(?:#(.+))?$/.exec(input);
    if (match) [, owner, repo, ref] = match;
  }
  repo = repo?.replace(/\.git$/i, "");
  if (!owner || !repo || !name.test(owner) || !name.test(repo))
    throw new Error(
      "Use owner/repository or a https://github.com/owner/repository link",
    );
  if (ref !== undefined && !refPattern.test(ref))
    throw new Error("Branch or tag name is not valid");
  return { owner, repo, ...(ref ? { ref } : {}) };
}

export function formatRepository(reference: RepositoryReference) {
  return `${reference.owner}/${reference.repo}${reference.ref ? "#" + reference.ref : ""}`;
}

// Normalizes any accepted input to the stored owner/repo[#ref] form.
export const repositoryReferenceSchema = z
  .string()
  .max(400)
  .transform((value, context) => {
    try {
      return formatRepository(parseRepository(value));
    } catch (e) {
      context.addIssue({ code: "custom", message: (e as Error).message });
      return z.NEVER;
    }
  });

export function repositoryWebUrl(reference: RepositoryReference) {
  return `https://github.com/${reference.owner}/${reference.repo}`;
}
