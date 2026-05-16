import { classify } from "./conflict-classifier.js";
import {
  mergeInstinctsOrFailures,
  mergeProgressFile,
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
      return { merged: `${ours}\n${r.resolvedContent}`, conflicts: [] };
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

export type ResolveMode = "autonomous" | "interactive";

export interface ResolveResult {
  allResolved: boolean;
  frozenRefused: boolean;
  escalateToDebug: boolean;
  resolvedPaths: string[];
  refusedPaths: string[];
  validationGate: ValidationGate;
}

export interface ResolveContext {
  statusContent: string;
  repoRoot: string;
  readFileContent: (path: string) => Promise<string>;
  writeFileContent: (path: string, content: string) => Promise<void>;
  runCheckCommand?: () => Promise<{ exitCode: number; changedFiles: Set<string> }>;
}

export async function resolveConflicts(
  paths: string[],
  _mode: ResolveMode,
  context: ResolveContext,
): Promise<ResolveResult> {
  const resolvedPaths: string[] = [];
  const refusedPaths: string[] = [];
  let frozenRefused = false;

  for (const path of paths) {
    const zone = classifyConflictZone(path, context.statusContent);

    if (zone === "frozen") {
      frozenRefused = true;
      refusedPaths.push(path);
    } else if (zone === "guarded") {
      const fileType = inferGuardedFileType(path);
      const ours = await context.readFileContent(path);
      const theirs = await context.readFileContent(path);
      const result = applyGuardedMerge(fileType, ours, theirs);
      await context.writeFileContent(path, result.merged);
      resolvedPaths.push(path);
    } else if (zone === "open") {
      const ours = await context.readFileContent(path);
      await context.writeFileContent(path, ours);
      resolvedPaths.push(path);
    } else {
      refusedPaths.push(path);
    }
  }

  const allResolved = resolvedPaths.length === paths.length;

  let validationGate: ValidationGate = {
    passed: allResolved,
    attemptCount: 0,
    escalateToDebug: false,
  };
  if (allResolved && context.runCheckCommand) {
    const checkResult = await context.runCheckCommand();
    const attempt: CheckAttempt = {
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

export interface HandleMergeConflictResult {
  handled: boolean;
  resolvedPaths: string[];
  refusedPaths: string[];
  shouldAbort: boolean;
  shouldEscalateDebug: boolean;
}

export async function handleMergeConflict(
  mergeError: string,
  mode: ResolveMode,
  context: Omit<ResolveContext, "repoRoot"> & { repoRoot: string },
): Promise<HandleMergeConflictResult> {
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

function inferGuardedFileType(path: string): GuardedFileType {
  if (path.includes("/progress/")) return "progress";
  if (path.includes("/knowledge/")) return "known-failures";
  if (path.includes("/reviews/")) return "reviews";
  if (/ADR-\d+/.test(path)) return "adr";
  return "progress";
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
