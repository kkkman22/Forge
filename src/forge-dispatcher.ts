import { readFileSync } from "node:fs";
import { validateTopic } from "./forge-dispatcher/allowlist.js";
import { resolveLibPath } from "./forge-dispatcher/path-resolve.js";
import { resolveAllowedTools } from "./forge-dispatcher/tools-resolve.js";
import { wrapWorkspaceContext } from "./forge-dispatcher/untrusted-fence.js";
import { appendAuditLog } from "./forge-dispatcher/audit-log.js";
import { checkIntegrity } from "./forge-dispatcher/integrity-check.js";

export { validateTopic, ALLOW_LIST } from "./forge-dispatcher/allowlist.js";
export { resolveLibPath } from "./forge-dispatcher/path-resolve.js";
export { resolveAllowedTools } from "./forge-dispatcher/tools-resolve.js";
export { wrapWorkspaceContext, UNTRUSTED_PREAMBLE } from "./forge-dispatcher/untrusted-fence.js";
export { appendAuditLog, computeHmac } from "./forge-dispatcher/audit-log.js";
export { checkIntegrity } from "./forge-dispatcher/integrity-check.js";

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

type StepMocks = Record<string, (...args: unknown[]) => unknown> | undefined;

export async function dispatchForgeSubcommand(
  topic: string,
  opts?: DispatchOpts,
): Promise<DispatchResult> {
  const mocks = opts?._mockSteps as StepMocks;

  // Step 1: resolveDispatcherMode
  const dispatcherMode = mocks?.resolveDispatcherMode
    ? (mocks.resolveDispatcherMode() as string)
    : (opts?.dispatcherMode ?? "collapsed");

  // Step 2: validateTopic
  const topicResult = mocks?.validateTopic
    ? (mocks.validateTopic(topic) as ReturnType<typeof validateTopic>)
    : validateTopic(topic);

  if (!topicResult.ok) {
    return {
      code: topicResult.code,
      suggestion: topicResult.suggestion
        ? `did you mean: ${topicResult.suggestion}?`
        : undefined,
    };
  }

  const sub = topicResult.value;

  // Step 3: resolveLibPath
  const cwd = opts?.cwd ?? process.cwd();
  const pathResult = mocks?.resolveLibPath
    ? (mocks.resolveLibPath(sub) as ReturnType<typeof resolveLibPath>)
    : resolveLibPath(sub, { pluginRoot: opts?.pluginRoot, cwd });

  if (!pathResult.ok) {
    return { code: pathResult.code };
  }

  // Step 4: checkIntegrity — sha256 vs manifest.json
  const integrityResult = mocks?.checkIntegrity
    ? (mocks.checkIntegrity(pathResult.path) as { ok: boolean })
    : checkIntegrity(pathResult.path);

  if (!integrityResult.ok) {
    return { code: "E_INTEGRITY_MISMATCH" };
  }

  // Step 5: resolveAllowedTools — read actual lib instructions.md
  let libContent: string;
  if (mocks?.resolveAllowedTools) {
    libContent = "";
  } else {
    try {
      libContent = readFileSync(pathResult.path, "utf-8");
    } catch {
      return { code: "E_LIB_READ_FAILED" };
    }
  }

  const toolsResult = mocks?.resolveAllowedTools
    ? (mocks.resolveAllowedTools(libContent) as ReturnType<typeof resolveAllowedTools>)
    : resolveAllowedTools(libContent);

  if (!toolsResult.ok) {
    return { code: toolsResult.code };
  }

  // Step 6: resolveDispatchMode
  let dispatchMode: string = "inline";
  if (mocks?.resolveDispatchMode) {
    dispatchMode = mocks.resolveDispatchMode() as string;
  } else if (opts?._overrideFrontmatter?.dispatch_mode !== undefined) {
    dispatchMode = opts._overrideFrontmatter.dispatch_mode as string;
  } else {
    // Default: fork for known fork-mode subs (zoom-out is fork, status is inline)
    const FORK_SUBS = new Set([
      "learn", "decide", "decide-teams", "debug", "grill", "storm", "recap",
      "mutate", "zoom-out", "review", "build", "plan", "spec", "ship", "test",
      "loop", "accept", "pack",
    ]);
    dispatchMode = FORK_SUBS.has(sub) ? "fork" : "inline";
  }

  // Step 7: wrapWorkspaceContext
  if (mocks?.wrapWorkspaceContext) {
    mocks.wrapWorkspaceContext([]);
  }

  // Step 8: dispatch
  const path = pathResult.path;
  const agentMock = (opts?._mocks as Record<string, unknown> | undefined)?.agent as
    | ((...args: unknown[]) => Promise<unknown>)
    | undefined;
  const readMock = (opts?._mocks as Record<string, unknown> | undefined)?.read as
    | ((...args: unknown[]) => unknown)
    | undefined;

  if (dispatchMode === "fork") {
    if (mocks?.dispatch) {
      mocks.dispatch({ code: "OK" });
    } else if (agentMock) {
      await agentMock({ prompt: `Read ${path}` });
    }
  } else {
    if (mocks?.dispatch) {
      mocks.dispatch({ code: "OK" });
    } else if (readMock) {
      readMock(path);
    }
  }

  // Step 9: writeAuditLog
  if (mocks?.writeAuditLog) {
    mocks.writeAuditLog();
  }

  const notice = dispatcherMode === "legacy"
    ? "legacy mode requires Forge < 2.6"
    : undefined;

  return {
    code: "OK",
    dispatchPath: path,
    notice,
  };
}
