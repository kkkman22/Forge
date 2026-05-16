import { resolve } from "node:path";

export interface ResolvedRoot {
  path: string;
  source: "env" | "cwd";
}

export function resolveProjectRoot(env: NodeJS.ProcessEnv = process.env): ResolvedRoot {
  const raw = (env.CLAUDE_PROJECT_DIR ?? "").trim();
  if (!raw) {
    return { path: process.cwd(), source: "cwd" };
  }
  return { path: resolve(raw), source: "env" };
}

export function logResolvedRoot(resolved: ResolvedRoot): void {
  const tag = resolved.source === "env" ? "(env)" : "(cwd fallback)";
  // biome-ignore lint/suspicious/noConsole: diagnostic log to stderr
  console.error(`[forge-context] resolved project root: ${resolved.path} ${tag}`);
}
