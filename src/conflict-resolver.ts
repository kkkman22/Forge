import { classify } from "./conflict-classifier.js";
import {
  mergeProgressFile,
  mergeInstinctsOrFailures,
  mergeReviewsFile,
  reassignAdrId,
} from "./guarded-merger.js";

export type Zone = "frozen" | "guarded" | "open" | "source";

export function classifyConflictZone(path: string, _statusContent: string): Zone {
  return classify(path);
}

export type GuardedFileType = "progress" | "known-failures" | "reviews" | "adr";

export interface MergeResult {
  merged: string;
  conflicts: string[];
}

export function applyGuardedMerge(
  type: GuardedFileType,
  ours: string,
  theirs: string,
): MergeResult {
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

export function buildFrozenRefusalPrompt(paths: string[]): string {
  const pathList = paths.map((p) => `  - ${p}`).join("\n");
  return `冻结区文件冲突，无法自动合并：

${pathList}

请选择：
1. 手动解决 — 保留当前冲突状态，手动编辑
2. 解锁后合并 — 将状态改为 draft，执行三方合并后重新锁定
3. 中止合并 — 执行 git merge --abort / rebase --abort`;
}

export interface ValidationGate {
  passed: boolean;
  attemptCount: number;
  escalateToDebug: boolean;
}

export interface CheckAttempt {
  timestamp: number;
  filesSinceLastAttempt: Set<string>;
  exitCode: number;
}

export function validateConflictResolution(attempts: CheckAttempt[]): ValidationGate {
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

function countStrikes(attempts: CheckAttempt[]): number {
  let count = 0;
  for (const a of attempts) {
    if (a.exitCode !== 0) {
      if (a.filesSinceLastAttempt.size > 0) count++;
    } else {
      count = 0;
    }
    if (count >= 3) return 3;
  }
  return count;
}

export function parseConflictedPaths(gitOutput: string): string[] {
  const matches = gitOutput.matchAll(/Merge conflict in (.+)$/gm);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const m of matches) {
    const path = m[1];
    if (path && !seen.has(path)) {
      seen.add(path);
      result.push(path);
    }
  }
  return result;
}
