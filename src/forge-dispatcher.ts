import { validateTopic } from "./forge-dispatcher/allowlist.js";
import { resolveLibPath } from "./forge-dispatcher/path-resolve.js";

export { validateTopic, ALLOW_LIST } from "./forge-dispatcher/allowlist.js";
export { resolveLibPath } from "./forge-dispatcher/path-resolve.js";

export interface DispatchOpts {
  mode?: string;
  dispatcherMode?: "collapsed" | "legacy";
  pluginRoot?: string;
  cwd?: string;
  _mocks?: Record<string, unknown>;
  _mockSteps?: Record<string, unknown>;
  _overrideFrontmatter?: Record<string, unknown>;
}

export interface DispatchResult {
  code: string;
  dispatchPath?: string;
  notice?: string;
  suggestion?: string;
}

export async function dispatchForgeSubcommand(
  topic: string,
  opts?: DispatchOpts,
): Promise<DispatchResult> {
  const validation = validateTopic(topic);

  if (!validation.ok) {
    return {
      code: validation.code,
      suggestion: validation.suggestion
        ? `did you mean: ${validation.suggestion}?`
        : undefined,
    };
  }

  const pathResult = resolveLibPath(validation.value, {
    pluginRoot: undefined,
    cwd: process.cwd(),
  });

  if (!pathResult.ok) {
    return { code: pathResult.code };
  }

  return {
    code: "OK",
    dispatchPath: pathResult.path,
  };
}
