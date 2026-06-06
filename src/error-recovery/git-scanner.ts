/**
 * Git State Scanner — parse and match git commit history.
 *
 * @module error-recovery/git-scanner
 */

import type { CommitTaskMatch, GitCommitEntry, TaskCommitPattern } from "./types.js";

/** Separates entries in `git log --format` output. */
const GIT_LOG_ENTRY_SEPARATOR = "\x00";

/**
 * Parse `git log --format` output into structured commit entries.
 *
 * Expected format: `<hash>\x00<message>\x00<timestamp>` per commit,
 * separated by newlines between entries.
 *
 * Returns an empty array for empty or unparseable input.
 *
 * @internal
 */
export function parseGitLog(rawOutput: string): GitCommitEntry[] {
  if (!rawOutput?.trim()) return [];

  const entries: GitCommitEntry[] = [];
  const lines = rawOutput.trim().split("\n");

  for (const line of lines) {
    const parts = line.split(GIT_LOG_ENTRY_SEPARATOR);
    if (parts.length >= 3) {
      const [hash, message, timestamp] = parts;
      if (hash && timestamp) {
        entries.push({ hash, message, timestamp });
      }
    }
  }

  return entries;
}

/**
 * Extract commit-message patterns from a Plan_Document's markdown content.
 *
 * Looks for task entries with commit message prefixes. Each task heading
 * (`## Task N: Title`) is parsed for its ID and title, and any commit
 * message convention (e.g. `feat(topic): ...`) is captured as the prefix.
 *
 * @internal
 */
export function extractCommitPatterns(planContent: string): TaskCommitPattern[] {
  const patterns: TaskCommitPattern[] = [];
  const taskRegex = /^##\s+Task\s+(\d+):\s+(.+)$/gm;
  let match: RegExpExecArray | null;

  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop pattern
  while ((match = taskRegex.exec(planContent)) !== null) {
    const taskId = match[1];
    const taskTitle = match[2].trim();
    const taskBlock = planContent.slice(match.index);

    // Look for commit message prefix in the task block (until next task heading)
    const nextTask = taskBlock.slice(taskBlock.indexOf("\n")).search(/^##\s+Task\s+\d+:/m);
    const blockContent =
      nextTask > 0 ? taskBlock.slice(0, taskBlock.indexOf("\n") + nextTask) : taskBlock;

    // Match patterns like: `feat(topic):`, `fix(topic):`, or any `word(...):` format
    // Also match `commit: <prefix>` or `prefix: <prefix>` patterns
    const prefixMatch =
      blockContent.match(/(?:commit|prefix)[:\s]+[`"]?(\S+)/i) ??
      blockContent.match(/([a-z]+\([^)]*\):)/i);
    const prefix = prefixMatch ? prefixMatch[1] : "";

    // Extract keywords from title (lowercased, filtered)
    const keywords = taskTitle
      .toLowerCase()
      .split(/[\s\-_]+/)
      .filter((w) => w.length > 2 && !["the", "and", "for", "with", "from"].includes(w));

    if (prefix || keywords.length > 0) {
      patterns.push({ taskId, taskTitle, prefix, keywords });
    }
  }

  return patterns;
}

/**
 * Filter commits to only those after the given ISO 8601 timestamp.
 * @internal
 */
export function filterCommitsSince(
  commits: GitCommitEntry[],
  sinceTimestamp: string,
): GitCommitEntry[] {
  const since = new Date(sinceTimestamp).getTime();
  if (Number.isNaN(since)) return commits;
  return commits.filter((c) => new Date(c.timestamp).getTime() > since);
}

/**
 * Match commits to tasks using prefix + keyword matching.
 *
 * A commit matches a task when:
 * - The commit message contains the task's prefix (if non-empty)
 * - The commit message contains at least one of the task's keywords
 *
 * Confidence is "exact" when prefix and all keywords match, "fuzzy" otherwise.
 *
 * @internal
 */
export function matchCommitsToTasks(
  commits: GitCommitEntry[],
  patterns: TaskCommitPattern[],
): CommitTaskMatch[] {
  const results: CommitTaskMatch[] = [];

  for (const commit of commits) {
    const msg = commit.message.toLowerCase();

    for (const pattern of patterns) {
      const prefixMatch = pattern.prefix ? msg.includes(pattern.prefix.toLowerCase()) : true;

      if (!prefixMatch) continue;

      const matchedKeywords = pattern.keywords.filter((kw) => msg.includes(kw));
      if (matchedKeywords.length === 0) continue;

      const confidence: "exact" | "fuzzy" =
        matchedKeywords.length === pattern.keywords.length ? "exact" : "fuzzy";

      results.push({
        commit,
        taskId: pattern.taskId,
        taskTitle: pattern.taskTitle,
        confidence,
      });
      break;
    }
  }

  return results;
}
