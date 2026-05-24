import { readFileSync } from "node:fs";
import { validateTopic } from "./forge-dispatcher/allowlist.js";
import { checkCmuxGate, type GateResult } from "./forge-dispatcher/cmux-gate.js";
import { checkIntegrity } from "./forge-dispatcher/integrity-check.js";
import { resolveLibPath } from "./forge-dispatcher/path-resolve.js";
import { resolveAllowedTools } from "./forge-dispatcher/tools-resolve.js";

export { ALLOW_LIST, validateTopic } from "./forge-dispatcher/allowlist.js";
export { appendAuditLog, computeHmac } from "./forge-dispatcher/audit-log.js";
export { checkCmuxGate, CMUX_GATED_SUBS, __resetGateForTest } from "./forge-dispatcher/cmux-gate.js";
export type { GateResult, GateBlockReason } from "./forge-dispatcher/cmux-gate.js";
export { checkIntegrity } from "./forge-dispatcher/integrity-check.js";
export { resolveLibPath } from "./forge-dispatcher/path-resolve.js";
export { resolveAllowedTools } from "./forge-dispatcher/tools-resolve.js";
export { UNTRUSTED_PREAMBLE, wrapWorkspaceContext } from "./forge-dispatcher/untrusted-fence.js";

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
      suggestion: topicResult.suggestion ? `did you mean: ${topicResult.suggestion}?` : undefined,
    };
  }

  const sub = topicResult.value;

  // === Step 2.5: Conditional_Availability_Gate ===
  const gateResult: GateResult = (opts?._mocks as Record<string, unknown> | undefined)
    ?.checkCmuxGate
    ? ((opts._mocks as Record<string, unknown>).checkCmuxGate(sub) as GateResult)
    : checkCmuxGate(sub);

  if (!gateResult.ok) {
    return { code: "SKILL_UNAVAILABLE" };
  }
  // === Step 2.5 end ===

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

  // Step 6: resolveDispatchMode — read from lib frontmatter
  let dispatchMode: string = "inline";
  if (mocks?.resolveDispatchMode) {
    dispatchMode = mocks.resolveDispatchMode() as string;
  } else if (opts?._overrideFrontmatter?.dispatch_mode !== undefined) {
    dispatchMode = opts._overrideFrontmatter.dispatch_mode as string;
  } else {
    // Parse dispatch_mode from libContent frontmatter
    const fmMatch = libContent.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      const modeMatch = fmMatch[1].match(/dispatch_mode:\s*([a-z]+)/);
      if (modeMatch) {
        dispatchMode = modeMatch[1];
      }
    }
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

  const notice = dispatcherMode === "legacy" ? "legacy mode requires Forge < 2.6" : undefined;

  return {
    code: "OK",
    dispatchPath: path,
    notice,
  };
}
