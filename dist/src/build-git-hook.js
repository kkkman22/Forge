import { parseConflictedPaths, resolveConflicts } from "./conflict-resolver.js";
export const buildGitHook = {
    async runWithConflictHandling(_operation, options) {
        const output = options.simulateOutput ?? "";
        const paths = parseConflictedPaths(output);
        if (paths.length === 0) {
            return { status: "success" };
        }
        const mode = options.mode ?? "interactive";
        const result = await resolveConflicts(paths, mode, {
            statusContent: options.statusContent ?? "",
            repoRoot: options.cwd,
            readFileContent: options.readFileContent,
            writeFileContent: options.writeFileContent,
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
//# sourceMappingURL=build-git-hook.js.map