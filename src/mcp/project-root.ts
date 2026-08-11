import { normalize, resolve, sep } from "node:path";

export interface ResolvedRoot {
  path: string;
  source: "env" | "cwd";
}

/** Reject paths containing `..` segments to prevent directory traversal. */
function containsTraversal(p: string): boolean {
  // Check both the raw string and the normalized result
  const segments = p.split(sep);
  if (segments.includes("..")) return true;
  const norm = normalize(p);
  const normSegments = norm.split(sep);
  return normSegments.includes("..");
}

export function resolveProjectRoot(env: NodeJS.ProcessEnv = process.env): ResolvedRoot {
  const raw = (env.CLAUDE_PROJECT_DIR ?? "").trim();
  if (!raw) {
    return { path: process.cwd(), source: "cwd" };
  }
  if (containsTraversal(raw)) {
    return { path: process.cwd(), source: "cwd" };
  }
  return { path: resolve(raw), source: "env" };
}

export function logResolvedRoot(resolved: ResolvedRoot): void {
  const tag = resolved.source === "env" ? "(env)" : "(cwd fallback)";
  // biome-ignore lint/suspicious/noConsole: diagnostic log to stderr
  console.error(`[tinkerman-context] resolved project root: ${resolved.path} ${tag}`);
}
