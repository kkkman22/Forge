const ALLOW_LIST = [
    "abort",
    "accept",
    "build",
    "build-light",
    "control-cli",
    "control-ui",
    "debug",
    "decide",
    "decide-teams",
    "fix",
    "fix-conflicts",
    "grill",
    "learn",
    "loop",
    "mutate",
    "pack",
    "plan",
    "recap",
    "refactor",
    "resume",
    "review",
    "router",
    "ship",
    "spec",
    "status",
    "storm",
    "test",
    "verify",
    "zoom-out",
];
function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++)
        dp[i][0] = i;
    for (let j = 0; j <= n; j++)
        dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] =
                a[i - 1] === b[j - 1]
                    ? dp[i - 1][j - 1]
                    : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[m][n];
}
export function validateTopic(topic) {
    const trimmed = topic.trim();
    if (ALLOW_LIST.includes(trimmed)) {
        return { ok: true, value: trimmed };
    }
    let bestMatch = "";
    let bestDist = Infinity;
    for (const sub of ALLOW_LIST) {
        const dist = levenshtein(trimmed, sub);
        if (dist < bestDist) {
            bestDist = dist;
            bestMatch = sub;
        }
    }
    return {
        ok: false,
        code: "E_UNKNOWN_SUB",
        suggestion: bestDist <= 3 ? bestMatch : undefined,
    };
}
export { ALLOW_LIST };
//# sourceMappingURL=allowlist.js.map