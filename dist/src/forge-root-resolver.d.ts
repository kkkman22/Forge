/**
 * Pure function to resolve the Forge installation root directory.
 *
 * Checks locations in priority order:
 *   1. Plugin root (pluginRoot/agents)
 *   2. Script-relative (scriptDir/../agents)
 *   3. Global (homeDir/.claude/skills/forge/agents)
 *
 * Returns the first matching location or {kind: "not-found", checked: [...]}.
 */
export interface ResolveInput {
    pluginRoot: string | null;
    scriptDir: string;
    homeDir: string;
}
export interface FsProbe {
    isDir(path: string): boolean;
}
export type ResolveResult = {
    kind: "plugin";
    root: string;
} | {
    kind: "script-relative";
    root: string;
} | {
    kind: "global";
    root: string;
} | {
    kind: "not-found";
    checked: string[];
};
export declare function resolveForgeRoot(input: ResolveInput, fs: FsProbe): ResolveResult;
