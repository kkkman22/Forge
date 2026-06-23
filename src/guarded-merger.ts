// Guarded merger — semantic merge functions for Forge guarded-zone files.
//
// Handles merge of progress, knowledge, review, and ADR files.
// All functions are pure: take string content, return merge result.
//
// Validates: Requirements R7.6-R7.9

export interface GuardedMergeResult {
  resolvedContent: string;
  strategy: string;
  warnings: string[];
}

/**
 * Merge progress files by task_id [R7.6].
 * completed > pending; tie-break: latest completed_at; then ours.
 */
export function mergeProgressFile(ours: string, theirs: string): GuardedMergeResult {
  const warnings: string[] = [];

  const ourTasks = parseProgressTasks(ours);
  const theirTasks = parseProgressTasks(theirs);

  const merged = new Map<string, ProgressTask>();
  for (const task of ourTasks) {
    merged.set(task.id, task);
  }

  for (const task of theirTasks) {
    const existing = merged.get(task.id);
    if (!existing) {
      merged.set(task.id, task);
    } else {
      // Merge: completed > pending; tie-break latest completed_at; then ours
      const winner = resolveProgressConflict(existing, task);
      if (winner === task) {
        warnings.push(`Task ${task.id}: theirs wins (newer or higher status)`);
      }
      merged.set(task.id, winner);
    }
  }

  const lines = Array.from(merged.values()).map(
    (t) => `- [${t.status === "completed" ? "x" : " "}] ${t.id}: ${t.text}`,
  );

  return {
    resolvedContent: lines.join("\n"),
    strategy: "task_id merge: completed > pending, latest completed_at, then ours",
    warnings,
  };
}

/**
 * Merge instincts or known-failures files [R7.7].
 * By pattern_id / failure_id: confidence = max, occurred_count = sum.
 * Single-side entries preserved verbatim.
 */
export function mergeInstinctsOrFailures(ours: string, theirs: string): GuardedMergeResult {
  const warnings: string[] = [];
  const ourEntries = parseKnowledgeEntries(ours);
  const theirEntries = parseKnowledgeEntries(theirs);

  const merged = new Map<string, KnowledgeEntry>();
  for (const entry of ourEntries) {
    merged.set(entry.id, entry);
  }

  for (const entry of theirEntries) {
    const existing = merged.get(entry.id);
    if (!existing) {
      merged.set(entry.id, entry);
    } else {
      // confidence = max, occurred_count = sum
      existing.confidence = Math.max(existing.confidence, entry.confidence);
      existing.occurredCount += entry.occurredCount;
      warnings.push(`Entry ${entry.id}: merged (conf=max, count=sum)`);
    }
  }

  const lines = Array.from(merged.values()).map(
    (e) => `${e.id}: confidence=${e.confidence} count=${e.occurredCount} | ${e.text}`,
  );

  return {
    resolvedContent: lines.join("\n"),
    strategy: "knowledge merge: confidence=max, occurred_count=sum, single-side preserved",
    warnings,
  };
}

/**
 * Merge review files by appending both sides, sorted by (layer, severity) [R7.9].
 */
export function mergeReviewsFile(ours: string, theirs: string): GuardedMergeResult {
  const ourFindings = parseReviewFindings(ours);
  const theirFindings = parseReviewFindings(theirs);

  const combined = [...ourFindings, ...theirFindings];
  combined.sort((a, b) => {
    const layerCmp = a.layer.localeCompare(b.layer);
    if (layerCmp !== 0) return layerCmp;
    return a.severity.localeCompare(b.severity);
  });

  const lines = combined.map((f) => `[${f.layer}][${f.severity}] ${f.file}: ${f.issue}`);

  return {
    resolvedContent: lines.join("\n"),
    strategy: "reviews merge: append both sides, sort by (layer, severity)",
    warnings: [],
  };
}

/**
 * Reassign ADR IDs in theirs content starting from nextId [R7.8].
 */
export function reassignAdrId(theirs: string, nextId: number): GuardedMergeResult {
  let current = nextId;
  const result = theirs.replace(/ADR-(\d+)/g, () => `ADR-${String(current++).padStart(3, "0")}`);

  return {
    resolvedContent: result,
    strategy: `ADR reassignment: starting from ADR-${String(nextId).padStart(3, "0")}`,
    warnings: [],
  };
}

// ---------------------------------------------------------------------------
// Internal types and parsers
// ---------------------------------------------------------------------------

interface ProgressTask {
  id: string;
  status: "completed" | "pending";
  text: string;
  completedAt: number;
}

interface KnowledgeEntry {
  id: string;
  confidence: number;
  occurredCount: number;
  text: string;
}

interface ReviewFinding {
  layer: string;
  severity: string;
  file: string;
  issue: string;
}

function parseProgressTasks(content: string): ProgressTask[] {
  return content
    .split("\n")
    .filter((line) => line.trim().startsWith("- ["))
    .map((line) => {
      const isCompleted = line.includes("[x]") || line.includes("[X]");
      const textMatch = line.match(/- \[.\]\s*(\S+):\s*(.*)/);
      const rawText = textMatch?.[2] ?? line.trim();
      const { text, completedAt } = extractProgressTimestamp(rawText, isCompleted);
      return {
        id: textMatch?.[1] ?? String(Math.random()),
        status: isCompleted ? ("completed" as const) : ("pending" as const),
        text,
        completedAt,
      };
    });
}

/**
 * Extract a real completion timestamp from a progress line's text tail.
 *
 * Recognises an optional trailing `@ <epoch-ms>` marker (e.g.
 * "Done @ 1717000000000"). When present and the task is completed, the parsed
 * epoch-ms is used as the deterministic completion time. When absent, the
 * timestamp falls back to sentinel `0` — never `Date.now()` — so that tie-break
 * is reproducible and does not silently prefer whichever side happened to be
 * parsed last.
 *
 * The `@ ...` marker is stripped from the returned text so it does not leak
 * into merge output.
 */
function extractProgressTimestamp(
  text: string,
  isCompleted: boolean,
): { text: string; completedAt: number } {
  const match = text.match(/\s@\s(\d+)\s*$/);
  if (!match) {
    // No real timestamp — deterministic sentinel, NOT Date.now().
    return { text, completedAt: isCompleted ? 0 : 0 };
  }
  const completedAt = Number.parseInt(match[1], 10);
  const stripped = text.slice(0, match.index).trimEnd();
  return { text: stripped, completedAt: Number.isFinite(completedAt) ? completedAt : 0 };
}

function resolveProgressConflict(ours: ProgressTask, theirs: ProgressTask): ProgressTask {
  if (ours.status === "completed" && theirs.status !== "completed") return ours;
  if (theirs.status === "completed" && ours.status !== "completed") return theirs;
  if (ours.completedAt >= theirs.completedAt) return ours;
  return theirs;
}

function parseKnowledgeEntries(content: string): KnowledgeEntry[] {
  return content
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const parts = line.split("|");
      const meta = parts[0] ?? "";
      const idMatch = meta.match(/^(\S+):/);
      const confMatch = meta.match(/confidence=([0-9.]+)/);
      const countMatch = meta.match(/count=(\d+)/);
      return {
        id: idMatch?.[1] ?? String(Math.random()),
        confidence: confMatch ? Number.parseFloat(confMatch[1]) : 0.5,
        occurredCount: countMatch ? Number.parseInt(countMatch[1], 10) : 1,
        text: parts.slice(1).join("|").trim() || line.trim(),
      };
    });
}

function parseReviewFindings(content: string): ReviewFinding[] {
  return content
    .split("\n")
    .filter((line) => line.trim().startsWith("["))
    .map((line) => {
      const match = line.match(/\[(\S+)\]\[(\S+)\]\s*(\S+):\s*(.*)/);
      return {
        layer: match?.[1] ?? "unknown",
        severity: match?.[2] ?? "P3",
        file: match?.[3] ?? "unknown",
        issue: match?.[4] ?? line.trim(),
      };
    });
}
