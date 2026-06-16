// AUTO-GENERATED - DO NOT EDIT
// Source: skills/forge/registry.toml
// Regen: node scripts/sync-command-registry.mjs

const ALLOW_LIST: ReadonlyArray<string> = [
  "abort",
  "accept",
  "build",
  "build-light",
  "charter",
  "control-cli",
  "control-ui",
  "debug",
  "decide",
  "decide-teams",
  "fix",
  "fix-conflicts",
  "forge-cmux-browser-qa",
  "forge-cmux-loop-signals",
  "forge-cmux-sidebar-sync",
  "grill",
  "init",
  "learn",
  "loop",
  "mutate",
  "pack",
  "plan",
  "recap",
  "refactor",
  "replay",
  "resume",
  "review",
  "review-comment-bitbucket",
  "router",
  "ship",
  "spec",
  "status",
  "storm",
  "test",
  "triage",
  "verify",
  "zoom-out",
] as const;

export type ValidatedSub = (typeof ALLOW_LIST)[number];

export interface AllowResult {
  ok: true;
  value: ValidatedSub;
}

export interface RejectResult {
  ok: false;
  code: "E_UNKNOWN_SUB";
  suggestion?: string;
}

export type TopicValidationResult = AllowResult | RejectResult;

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
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

export function validateTopic(topic: string): TopicValidationResult {
  const trimmed = topic.trim();

  if ((ALLOW_LIST as readonly string[]).includes(trimmed)) {
    return { ok: true, value: trimmed as ValidatedSub };
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
