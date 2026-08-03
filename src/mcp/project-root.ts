import { normalize, resolve, sep } from "node:path";
import { getHostAdapter } from "../host/detect.js";

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

/**
 * Resolve the project root via the injected HostAdapter (Zcode-aware: prefers
 * ZCODE_PROJECT_DIR, compat-falls back to CLAUDE_PROJECT_DIR). Under a Claude
 * host this reads CLAUDE_PROJECT_DIR — byte-equal to the pre-P2 direct read.
 *
 * The `env` param is an explicit-override test seam: when a caller passes a
 * non-process.env object, its CLAUDE_PROJECT_DIR wins (back-compat with the
 * original signature). When omitted/defaulting to process.env, the adapter is
 * the single source.
 */
export function resolveProjectRoot(env: NodeJS.ProcessEnv = process.env): ResolvedRoot {
  // Explicit-override path (test seam / caller override).
  if (env !== process.env) {
    const raw = (env.CLAUDE_PROJECT_DIR ?? "").trim();
    if (!raw) return { path: process.cwd(), source: "cwd" };
    if (containsTraversal(raw)) return { path: process.cwd(), source: "cwd" };
    return { path: resolve(raw), source: "env" };
  }
  // Adapter-driven path (default): Zcode-aware projectDir.
  const raw = (getHostAdapter().paths().projectDir ?? "").trim();
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
  console.error(`[forge-context] resolved project root: ${resolved.path} ${tag}`);
}
