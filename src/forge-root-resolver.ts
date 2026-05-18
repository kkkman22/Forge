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

export type ResolveResult =
  | { kind: "plugin"; root: string }
  | { kind: "script-relative"; root: string }
  | { kind: "global"; root: string }
  | { kind: "not-found"; checked: string[] };

export function resolveForgeRoot(input: ResolveInput, fs: FsProbe): ResolveResult {
  const checked: string[] = [];

  if (input.pluginRoot && input.pluginRoot.length > 0) {
    const candidate = `${input.pluginRoot}/agents`;
    checked.push(input.pluginRoot);
    if (fs.isDir(candidate)) {
      return { kind: "plugin", root: input.pluginRoot };
    }
  }

  // scriptDir/../agents — resolve parent
  const scriptParent = `${input.scriptDir.replace(/\/$/, "")}/..`;
  // Normalize: resolve ".." by removing the last path component
  const normalizedParent = scriptParent.replace(/\/[^/]+\/\.\.$/, "");
  checked.push(normalizedParent);
  if (fs.isDir(`${normalizedParent}/agents`)) {
    return { kind: "script-relative", root: normalizedParent };
  }

  const globalRoot = `${input.homeDir}/.claude/skills/forge`;
  checked.push(globalRoot);
  if (fs.isDir(`${globalRoot}/agents`)) {
    return { kind: "global", root: globalRoot };
  }

  return { kind: "not-found", checked };
}
