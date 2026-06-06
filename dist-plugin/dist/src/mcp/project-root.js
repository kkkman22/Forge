import { normalize, resolve, sep } from "node:path";
/** Reject paths containing `..` segments to prevent directory traversal. */
function containsTraversal(p) {
    // Check both the raw string and the normalized result
    const segments = p.split(sep);
    if (segments.includes(".."))
        return true;
    const norm = normalize(p);
    const normSegments = norm.split(sep);
    return normSegments.includes("..");
}
export function resolveProjectRoot(env = process.env) {
    const raw = (env.CLAUDE_PROJECT_DIR ?? "").trim();
    if (!raw) {
        return { path: process.cwd(), source: "cwd" };
    }
    if (containsTraversal(raw)) {
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