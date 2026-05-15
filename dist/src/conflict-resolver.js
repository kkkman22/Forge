import { classify } from "./conflict-classifier.js";
import { mergeInstinctsOrFailures, mergeProgressFile, mergeReviewsFile, reassignAdrId, } from "./guarded-merger.js";
export function classifyConflictZone(path, _statusContent) {
    return classify(path);
}
export function applyGuardedMerge(type, ours, theirs) {
    switch (type) {
        case "progress": {
            const r = mergeProgressFile(ours, theirs);
            return { merged: r.resolvedContent, conflicts: r.warnings };
        }
        case "known-failures": {
            const r = mergeInstinctsOrFailures(ours, theirs);
            return { merged: r.resolvedContent, conflicts: r.warnings };
        }
        case "reviews": {
            const r = mergeReviewsFile(ours, theirs);
            return { merged: r.resolvedContent, conflicts: r.warnings };
        }
        case "adr": {
            const r = reassignAdrId(theirs, 1);
            return { merged: ours + "\n" + r.resolvedContent, conflicts: [] };
        }
    }
}
export function buildFrozenRefusalPrompt(paths) {
    const pathList = paths.map((p) => `  - ${p}`).join("\n");
    return `冻结区文件冲突，无法自动合并：

${pathList}

请选择：
1. 手动解决 — 保留当前冲突状态，手动编辑
2. 解锁后合并 — 将状态改为 draft，执行三方合并后重新锁定
3. 中止合并 — 执行 git merge --abort / rebase --abort`;
}
export function validateConflictResolution(attempts) {
    if (attempts.length === 0) {
        return { passed: true, attemptCount: 0, escalateToDebug: false };
    }
    const last = attempts[attempts.length - 1];
    if (last.exitCode === 0) {
        return { passed: true, attemptCount: countStrikes(attempts), escalateToDebug: false };
    }
    const strikeCount = countStrikes(attempts);
    return {
        passed: false,
        attemptCount: strikeCount,
        escalateToDebug: strikeCount >= 3,
    };
}
function countStrikes(attempts) {
    let count = 0;
    for (const a of attempts) {
        if (a.exitCode !== 0) {
            if (a.filesSinceLastAttempt.size > 0)
                count++;
        }
        else {
            count = 0;
        }
        if (count >= 3)
            return 3;
    }
    return count;
}
export async function resolveConflicts(paths, _mode, context) {
    const resolvedPaths = [];
    const refusedPaths = [];
    let frozenRefused = false;
    for (const path of paths) {
        const zone = classifyConflictZone(path, context.statusContent);
        if (zone === "frozen") {
            frozenRefused = true;
            refusedPaths.push(path);
        }
        else if (zone === "guarded") {
            const fileType = inferGuardedFileType(path);
            const ours = await context.readFileContent(path);
            const theirs = await context.readFileContent(path);
            const result = applyGuardedMerge(fileType, ours, theirs);
            await context.writeFileContent(path, result.merged);
            resolvedPaths.push(path);
        }
        else if (zone === "open") {
            const ours = await context.readFileContent(path);
            await context.writeFileContent(path, ours);
            resolvedPaths.push(path);
        }
        else {
            refusedPaths.push(path);
        }
    }
    const allResolved = resolvedPaths.length === paths.length;
    let validationGate = {
        passed: allResolved,
        attemptCount: 0,
        escalateToDebug: false,
    };
    if (allResolved && context.runCheckCommand) {
        const checkResult = await context.runCheckCommand();
        const attempt = {
            timestamp: Date.now(),
            filesSinceLastAttempt: checkResult.changedFiles,
            exitCode: checkResult.exitCode,
        };
        validationGate = validateConflictResolution([attempt]);
    }
    return {
        allResolved: allResolved && validationGate.passed,
        frozenRefused,
        escalateToDebug: validationGate.escalateToDebug,
        resolvedPaths,
        refusedPaths,
        validationGate,
    };
}
export async function handleMergeConflict(mergeError, mode, context) {
    const paths = parseConflictedPaths(mergeError);
    if (paths.length === 0) {
        return {
            handled: false,
            resolvedPaths: [],
            refusedPaths: [],
            shouldAbort: true,
            shouldEscalateDebug: false,
        };
    }
    const result = await resolveConflicts(paths, mode, context);
    return {
        handled: true,
        resolvedPaths: result.resolvedPaths,
        refusedPaths: result.refusedPaths,
        shouldAbort: result.frozenRefused || !result.allResolved,
        shouldEscalateDebug: result.escalateToDebug,
    };
}
function inferGuardedFileType(path) {
    if (path.includes("/progress/"))
        return "progress";
    if (path.includes("/knowledge/"))
        return "known-failures";
    if (path.includes("/reviews/"))
        return "reviews";
    if (/ADR-\d+/.test(path))
        return "adr";
    return "progress";
}
export function parseConflictedPaths(gitOutput) {
    const matches = gitOutput.matchAll(/Merge conflict in (.+)$/gm);
    const seen = new Set();
    const result = [];
    for (const m of matches) {
        const path = m[1];
        if (path && !seen.has(path)) {
            seen.add(path);
            result.push(path);
        }
    }
    return result;
}
//# sourceMappingURL=conflict-resolver.js.map