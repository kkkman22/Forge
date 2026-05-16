import { resolve } from "node:path";
export function resolveProjectRoot(env = process.env) {
    const raw = (env.CLAUDE_PROJECT_DIR ?? "").trim();
    if (!raw) {
        return { path: process.cwd(), source: "cwd" };
    }
    return { path: resolve(raw), source: "env" };
}
export function logResolvedRoot(resolved) {
    const tag = resolved.source === "env" ? "(env)" : "(cwd fallback)";
    // biome-ignore lint/suspicious/noConsole: diagnostic log to stderr
    console.error(`[forge-context] resolved project root: ${resolved.path} ${tag}`);
}
//# sourceMappingURL=project-root.js.map