import { createHash } from "node:crypto";

export interface ReviewIssue {
  severity: "P0" | "P1" | "P2" | "P3";
  file: string;
  line: number;
  message: string;
}

export interface KnownFailure {
  pattern_id: string;
  severity: "P0" | "P1";
  first_seen: string;
  last_seen: string;
  occurrence_count: number;
  signature: string;
  fix_required: string;
}

export interface AppendBlock {
  pattern_id: string;
  severity: "P0" | "P1";
  first_seen_commit: string;
  signature: string;
  fix_required: string;
}

export interface DiffSummary {
  files: string[];
  changedText: string;
}

const MAX_ENTRIES = 80;
const ARCHIVE_THRESHOLD = 100;

export function generateAppendBlock(issue: ReviewIssue, commitSha: string): AppendBlock | null {
  if (issue.severity !== "P0" && issue.severity !== "P1") return null;

  const signature = `${issue.file}:${issue.line} ${issue.message}`;
  const hash = createHash("sha256").update(signature).digest("hex").slice(0, 8);
  const pattern_id = `kf-${hash}`;

  return {
    pattern_id,
    severity: issue.severity,
    first_seen_commit: commitSha,
    signature: issue.message,
    fix_required: `fix ${issue.message}`,
  };
}

export function mergeKnownFailures(
  existing: KnownFailure[],
  newBlocks: AppendBlock[],
): KnownFailure[] {
  const map = new Map<string, KnownFailure>();
  for (const entry of existing) {
    map.set(entry.pattern_id, { ...entry });
  }

  const today = new Date().toISOString().slice(0, 10);

  for (const block of newBlocks) {
    const existingEntry = map.get(block.pattern_id);
    if (existingEntry) {
      existingEntry.last_seen = today;
      existingEntry.occurrence_count++;
    } else {
      map.set(block.pattern_id, {
        pattern_id: block.pattern_id,
        severity: block.severity,
        first_seen: today,
        last_seen: today,
        occurrence_count: 1,
        signature: block.signature,
        fix_required: block.fix_required,
      });
    }
  }

  let results = [...map.values()];

  if (results.length > ARCHIVE_THRESHOLD) {
    results.sort((a, b) => a.last_seen.localeCompare(b.last_seen));
    results = results.slice(-MAX_ENTRIES);
  }

  return results;
}

export function serializeKnownFailures(failures: KnownFailure[]): string {
  const lines: string[] = [];
  for (const f of failures) {
    lines.push(`- pattern_id: ${f.pattern_id}`);
    lines.push(`  severity: ${f.severity}`);
    lines.push(`  first_seen: "${f.first_seen}"`);
    lines.push(`  last_seen: "${f.last_seen}"`);
    lines.push(`  occurrence_count: ${f.occurrence_count}`);
    lines.push(`  signature: "${f.signature}"`);
    lines.push(`  fix_required: "${f.fix_required}"`);
    lines.push("");
  }
  return lines.join("\n");
}

export function parseKnownFailures(content: string): KnownFailure[] {
  const results: KnownFailure[] = [];
  const blocks = content.split(/\n(?=- pattern_id:)/);

  for (const block of blocks) {
    const get = (field: string): string => {
      const m = block.match(new RegExp(`${field}:\\s*"?([^"\\n]+)"?`, "m"));
      return m ? m[1].trim() : "";
    };

    const pattern_id = get("pattern_id");
    if (!pattern_id) continue;

    const severity = get("severity") as "P0" | "P1";
    const occurrenceStr = get("occurrence_count");
    const occurrence_count = occurrenceStr ? Number(occurrenceStr) : 1;

    results.push({
      pattern_id,
      severity,
      first_seen: get("first_seen"),
      last_seen: get("last_seen"),
      occurrence_count,
      signature: get("signature"),
      fix_required: get("fix_required"),
    });
  }

  return results;
}

export function detectRecurrence(failures: KnownFailure[], diff: DiffSummary): string[] {
  const results: string[] = [];

  for (const failure of failures) {
    const sigWords = failure.signature
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const diffLower = diff.changedText.toLowerCase();

    const matchCount = sigWords.filter((word) => diffLower.includes(word)).length;
    const matchRatio = sigWords.length > 0 ? matchCount / sigWords.length : 0;

    if (matchRatio < 0.2) continue;

    const fixKeywords = failure.fix_required.toLowerCase().split(/\s+/);
    const fixInDiff = fixKeywords.some((kw) => kw.length > 3 && diffLower.includes(kw));

    if (!fixInDiff) {
      results.push(
        `known-failure recurrence — pattern ${failure.pattern_id}, last seen at ${failure.last_seen}`,
      );
    }
  }

  return results;
}
