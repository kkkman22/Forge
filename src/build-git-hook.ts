import { parseConflictedPaths, resolveConflicts } from "./conflict-resolver.js";
import type { ResolveMode, ResolveResult } from "./conflict-resolver.js";

export interface BuildGitHookOptions {
  cwd: string;
  simulateOutput?: string;
  mode?: ResolveMode;
  statusContent?: string;
  readFileContent?: (path: string) => Promise<string>;
  writeFileContent?: (path: string, content: string) => Promise<void>;
}

export interface BuildGitHookResult {
  status: "success" | "conflict" | "frozen-refused" | "escalate-debug";
  conflictResult?: ResolveResult;
}

export const buildGitHook = {
  async runWithConflictHandling(
    _operation: "rebase" | "pull" | "merge",
    options: BuildGitHookOptions,
  ): Promise<BuildGitHookResult> {
    const output = options.simulateOutput ?? "";
    const paths = parseConflictedPaths(output);

    if (paths.length === 0) {
      return { status: "success" };
    }

    const mode: ResolveMode = options.mode ?? "interactive";
    const result = await resolveConflicts(paths, mode, {
      statusContent: options.statusContent ?? "",
      repoRoot: options.cwd,
      readFileContent: options.readFileContent ?? (async () => ""),
      writeFileContent: options.writeFileContent ?? (async () => {}),
    });

    if (result.escalateToDebug) {
      return { status: "escalate-debug", conflictResult: result };
    }

    if (result.frozenRefused) {
      return { status: "frozen-refused", conflictResult: result };
    }

    return { status: "conflict", conflictResult: result };
  },
};
