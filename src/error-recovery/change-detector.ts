/**
 * Uncommitted Change Detector — parse and filter git status output.
 *
 * @module error-recovery/change-detector
 */

import type { FileChange } from "./types.js";

/**
 * Parse `git status --porcelain` output into FileChange entries.
 *
 * Porcelain format: `XY filename` where XY are status codes.
 * Returns an empty array for empty input.
 *
 * @internal
 */
export function parseGitStatus(rawOutput: string): FileChange[] {
  if (!rawOutput?.trim()) return [];

  const changes: FileChange[] = [];
  for (const line of rawOutput.trim().split("\n")) {
    if (line.length < 4) continue;

    const statusCode = line.slice(0, 2);
    const filePath = line.slice(3);

    let status: FileChange["status"];
    if (statusCode.includes("??")) {
      status = "untracked";
    } else if (statusCode.includes("D") || statusCode.includes("D ")) {
      status = "deleted";
    } else if (statusCode.includes("A") || statusCode.startsWith("A")) {
      status = "added";
    } else {
      status = "modified";
    }

    changes.push({ filePath, status });
  }

  return changes;
}

/**
 * Filter changes to only those whose paths overlap with the task's expected paths.
 * @internal
 */
export function matchChangesToTask(changes: FileChange[], taskFilePaths: string[]): FileChange[] {
  const taskPathSet = new Set(taskFilePaths);
  return changes.filter((c) => {
    if (taskPathSet.has(c.filePath)) return true;
    // Check if the change path starts with any task path (directory match)
    for (const tp of taskFilePaths) {
      if (c.filePath.startsWith(`${tp}/`) || tp.startsWith(`${c.filePath}/`)) {
        return true;
      }
    }
    return false;
  });
}
