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
