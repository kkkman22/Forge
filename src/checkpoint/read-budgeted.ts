/**
 * Section-aware budgeted checkpoint reading (regenerative-checkpoint R3, Task 4).
 *
 * Pure function: given a checkpoint.md body (sections delimited by `## `) and a
 * token budget, return the full text if it fits, or a skeleton (headers +
 * italic instruction lines preserved, bodies truncated) with a truncation hint.
 *
 * Used by PostCompact hook to inject a compact-but-structured checkpoint into
 * the rebuilt context. Section-aware so even when the GLM-5.2 600K compact
 * budget is tight, the agent still sees the section skeleton (D9 rationale).
 *
 * Design ref: .forge/specs/regenerative-checkpoint/design.md §接口设计
 * Inspired by MiMo-Code's readBudgetedSectionAware (MIT, OpenCode fork).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** @public */
export interface BudgetedReadResult {
  text: string;
  truncated: boolean;
  totalTokens: number;
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/**
 * Rough token estimate: ~4 chars per token for mixed CJK + ASCII.
 * Matches the heuristic used elsewhere in Forge (src/loop/token-estimate).
 * Over-estimation is the safe direction here (truncates sooner → less risk
 * of exceeding the real budget).
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// Section parsing
// ---------------------------------------------------------------------------

interface Section {
  header: string;
  /** Italic instruction lines (`_..._`) directly under the header. */
  italicLines: string[];
  /** Index lines (lines starting with `- See ...`) — kept in skeleton. */
  indexLines: string[];
  /** Body lines (everything else under this section). */
  bodyLines: string[];
}

interface ParsedSections {
  preamble: string[];
  sections: Section[];
}

/**
 * Parse a checkpoint.md body into preamble + sections.
 * A section starts at a `## ` line. Lines before the first section are preamble.
 * Italic lines (`_..._`) and index lines (`- See ...`) are separated from body
 * so the skeleton can preserve them while truncating body.
 */
function parseSections(text: string): ParsedSections {
  const preamble: string[] = [];
  const sections: Section[] = [];
  let current: Section | null = null;
  let italicDone = false;

  for (const line of text.split("\n")) {
    if (line.startsWith("## ")) {
      if (current) sections.push(current);
      current = { header: line, italicLines: [], indexLines: [], bodyLines: [] };
      italicDone = false;
      continue;
    }
    if (current) {
      // Italic instruction: starts and ends with _, appears before body.
      if (!italicDone && line.startsWith("_") && line.trim().endsWith("_")) {
        current.italicLines.push(line);
        continue;
      }
      // Once a non-italic line appears after italics, stop collecting italics.
      if (line.trim() !== "" && !(line.startsWith("_") && line.trim().endsWith("_"))) {
        italicDone = true;
      }
      // Index lines: `- See <path>.md (NNN ...)` — kept in skeleton.
      if (/^\s*- See \S+\.md \(\d+/.test(line.trim())) {
        current.indexLines.push(line);
        continue;
      }
      current.bodyLines.push(line);
    } else {
      preamble.push(line);
    }
  }
  if (current) sections.push(current);
  return { preamble, sections };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read a checkpoint body with a token budget. If the full text fits, return it
 * verbatim. Otherwise, return a skeleton: preamble + each section's header +
 * italic instructions + index lines (always preserved), with body lines
 * truncated to fit the remaining budget, plus a truncation hint.
 *
 * @param body - The checkpoint.md file content.
 * @param budgetTokens - Maximum tokens to return.
 */
export function readBudgetedSectionAware(body: string, budgetTokens: number): BudgetedReadResult {
  if (!body || body.length === 0) {
    return { text: "", truncated: false, totalTokens: 0 };
  }

  const totalTokens = estimateTokens(body);
  if (totalTokens <= budgetTokens) {
    return { text: body, truncated: false, totalTokens };
  }

  const { preamble, sections } = parseSections(body);

  // Case: no sections (flat text). Just truncate at budget.
  if (sections.length === 0) {
    const ratio = budgetTokens / totalTokens;
    const cutLen = Math.floor(body.length * ratio * 0.95);
    const truncatedText = body.slice(0, cutLen);
    return {
      text: truncatedText + truncationHint(budgetTokens, totalTokens),
      truncated: true,
      totalTokens,
    };
  }

  // Compute skeleton cost (preamble + all headers + italic + index lines).
  const skeletonParts: string[] = [
    ...preamble,
    ...sections.flatMap((s) => [s.header, ...s.italicLines, ...s.indexLines]),
  ];
  const skeletonTokens = estimateTokens(skeletonParts.join("\n"));

  // If even the skeleton exceeds budget, return headers + italic only (no body at all).
  if (skeletonTokens >= budgetTokens) {
    const minimalSkeleton = [
      ...preamble,
      ...sections.flatMap((s) => [s.header, ...s.italicLines, ...s.indexLines, ""]),
    ].join("\n");
    return {
      text: minimalSkeleton + truncationHint(budgetTokens, totalTokens),
      truncated: true,
      totalTokens,
    };
  }

  // Greedily fill sections: skeleton first, then body lines per section.
  const out: string[] = [...preamble];
  let used = estimateTokens(out.join("\n"));

  for (const sec of sections) {
    const headerPart = [sec.header, ...sec.italicLines, ...sec.indexLines].join("\n");
    out.push(headerPart);
    used += estimateTokens(headerPart);

    const fullBody = sec.bodyLines.join("\n");
    const bodyTokens = estimateTokens(fullBody);

    if (used + bodyTokens <= budgetTokens) {
      // Entire body fits.
      out.push(fullBody);
      used += bodyTokens;
    } else {
      // Partial body: fill remaining budget (95% to leave margin).
      const remaining = budgetTokens - used;
      if (remaining > 20) {
        const ratio = remaining / bodyTokens;
        const cutLen = Math.floor(fullBody.length * ratio * 0.95);
        const lastNewline = fullBody.lastIndexOf("\n", cutLen);
        const clean = lastNewline > 0 ? fullBody.slice(0, lastNewline) : fullBody.slice(0, cutLen);
        out.push(clean);
        used += remaining;
      }
    }
    out.push("");
  }

  return {
    text: out.join("\n") + truncationHint(budgetTokens, totalTokens),
    truncated: true,
    totalTokens,
  };
}

function truncationHint(budgetTokens: number, totalTokens: number): string {
  return (
    `\n\n⚠️ Truncated at ~${budgetTokens} tokens. ` +
    `checkpoint.md is ~${totalTokens} tokens total. ` +
    `Read(".forge/checkpoint.md") for full content.`
  );
}
