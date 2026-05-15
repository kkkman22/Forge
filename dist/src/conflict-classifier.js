// Conflict classifier — zone-based path classification for merge conflicts.
//
// Four zones with priority chain (first match wins):
//   1. frozen: .forge/config.md, .forge/specs/{topic}/spec.md, .forge/plans/{topic}.md
//   2. guarded: .forge/progress, .forge/reviews, knowledge files, ADRs
//   3. open: other .forge files
//   4. source: anything outside .forge/
//
// Total function [R13.1]: for any path, returns a valid Zone
// Deterministic [R13.2]: classify(normalize(p)) === classify(p)
//
// Validates: Requirements R7.1, R13.1, R13.2
const FROZEN_PATTERNS = [
    /^\.forge\/config\.md$/,
    /^\.forge\/specs\/[^/]+\/spec\.md$/,
    /^\.forge\/plans\/[^/]+\.md$/,
];
const GUARDED_PATTERNS = [
    /^\.forge\/progress\//,
    /^\.forge\/reviews\//,
    /^\.forge\/knowledge\/instincts\.md$/,
    /^\.forge\/knowledge\/known-failures\.md$/,
    /^\.forge\/knowledge\/solutions\//,
    /^\.forge\/decisions\/ADR-\d+.*\.md$/,
];
const FORGE_PREFIX = ".forge/";
/**
 * Normalize a path: strip trailing slashes, then strip leading "./".
 */
export function normalizePath(p) {
    let result = p;
    // Strip trailing slashes
    result = result.replace(/\/+$/, "");
    // Strip leading ./
    while (result.startsWith("./")) {
        result = result.slice(2);
    }
    return result;
}
/**
 * Classify a path into one of four zones.
 * Total function — always returns a valid Zone [R13.1].
 */
export function classify(path) {
    const p = normalizePath(path);
    if (!p.startsWith(FORGE_PREFIX)) {
        return "source";
    }
    // Check frozen patterns (highest priority)
    for (const pattern of FROZEN_PATTERNS) {
        if (pattern.test(p))
            return "frozen";
    }
    // Check guarded patterns
    for (const pattern of GUARDED_PATTERNS) {
        if (pattern.test(p))
            return "guarded";
    }
    // Everything else under .forge/ is open
    return "open";
}
export function buildConflictValidationFailedContext(input) {
    return {
        skill: "forge-fix-conflicts",
        topic: input.topic,
        tier: input.tier,
        trigger: "conflict_validation_failed",
        situation: input.checkOutput
            ? `冲突验证失败：${input.conflictPath} — ${input.checkOutput}`
            : `冲突验证失败：${input.conflictPath}`,
        rootCause: input.checkOutput,
    };
}
//# sourceMappingURL=conflict-classifier.js.map