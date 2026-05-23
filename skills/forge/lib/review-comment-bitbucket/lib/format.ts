import type { Finding, FormatOutput } from "./types.js";
import { computeFindingHash, buildMarker } from "./finding-hash.js";

// Unicode \p{C} covers C0 (x00-x1F), DEL (x7F), C1 (x80-x9F), surrogates, U+2028/U+2029, etc.
// Additionally strip \t \n \r for task_text where line breaks are disallowed.
const TASK_TEXT_DISALLOWED_RE = /[\t\n\r\u2028\u2029\u202e\p{C}]/gu;

function sanitizeTaskText(s: string): string {
  return s.replace(TASK_TEXT_DISALLOWED_RE, "");
}

function maxConsecutiveBackticks(s: string): number {
  let max = 0;
  let current = 0;
  for (const ch of s) {
    if (ch === "`") {
      current++;
      if (current > max) max = current;
    } else {
      current = 0;
    }
  }
  return max;
}

export function formatFinding(finding: Finding, runId: string, prefix: string): FormatOutput {
  const hash = computeFindingHash(finding);
  const marker = buildMarker(prefix, hash);

  // Build comment_text
  let comment_text = "";

  // Tag header: **[Forge <priority> · <source_layer>]** <finding_type>
  const tagHeader = `**[Forge ${finding.priority} · ${finding.source_layer}]** ${finding.finding_type}`;
  comment_text += tagHeader + "\n";
  comment_text += "\n";

  // Message
  comment_text += finding.message + "\n";

  // Suggestion block (if present)
  if (finding.suggestion) {
    // Calculate fence length: one more than the longest backtick run in either message or suggestion
    const maxBackticks = Math.max(
      maxConsecutiveBackticks(finding.message),
      maxConsecutiveBackticks(finding.suggestion),
    );
    const fenceLen = Math.max(3, maxBackticks + 1);
    const backticks = "`".repeat(fenceLen);

    comment_text += "\n";
    comment_text += `${backticks}suggestion\n`;
    comment_text += finding.suggestion + "\n";
    comment_text += `${backticks}\n`;
  }

  // Blank line + review run + marker
  comment_text += "\n";
  comment_text += `_review run: ${runId}_\n`;
  comment_text += marker;

  // Build task_text
  let task_text = "";

  if (finding.priority === "P0" || finding.priority === "P1") {
    const prefixPart = `[Forge ${finding.priority}] `;
    const fileAndLine = `${finding.file_path}:${finding.line_number}`;
    const separatorPart = " — ";
    const spaceForMarker = " " + marker;
    const ellipsis = "...";

    const prefixLength = prefixPart.length;
    const fileAndLineLength = fileAndLine.length;
    const separatorLength = separatorPart.length;
    const markerLength = spaceForMarker.length;
    const ellipsisLength = ellipsis.length;
    const maxLength = 200;

    const availableForMessage = maxLength - prefixLength - fileAndLineLength - separatorLength - markerLength;

    let truncatedMessage = finding.message;
    if (finding.message.length > availableForMessage) {
      const truncateTo = availableForMessage - ellipsisLength;
      truncatedMessage = finding.message.slice(0, Math.max(0, truncateTo));
      const lastSpace = truncatedMessage.lastIndexOf(" ");
      if (lastSpace > truncateTo * 0.5) {
        truncatedMessage = truncatedMessage.slice(0, lastSpace);
      }
      truncatedMessage += ellipsis;
    }

    task_text = prefixPart + fileAndLine + separatorPart + truncatedMessage + spaceForMarker;
    task_text = sanitizeTaskText(task_text);
  }

  // Build done_comment_text
  const done_comment_text = `Forge auto-resolved (no longer present in review ${runId}). ${marker}`;

  // Build reopen_comment_text
  const reopen_comment_text = `Forge re-opened (still present in review ${runId}). ${marker}`;

  return {
    task_text,
    comment_text,
    marker,
    done_comment_text,
    reopen_comment_text,
  };
}
