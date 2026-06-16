#!/usr/bin/env node
/**
 * compact-inject.mjs — PostCompact budgeted injection bridge (regenerative-checkpoint R3/P1 fix).
 *
 * Called by hook-postcompact.sh when snapshot_source=checkpoint. Reads
 * .forge/checkpoint.md, applies section-aware budget truncation (same logic as
 * src/checkpoint/read-budgeted.ts), outputs the (possibly truncated) checkpoint
 * body to stdout for the hook to inject.
 *
 * Self-contained (no dist dependency): the truncation logic is inlined here so
 * the hook works without compiled TS. The canonical implementation lives in
 * src/checkpoint/read-budgeted.ts (tested); this is a faithful ESM mirror.
 *
 * Usage: node scripts/compact-inject.mjs <checkpoint-path> [budget-tokens]
 *   budget-tokens default: 11000 (matches PostCompact hook cap)
 *
 * Exit 0 always (fail-open: on any error, output raw checkpoint or empty).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CHECKPOINT_PATH = process.argv[2] ?? ".forge/checkpoint.md";
const BUDGET_TOKENS = Number.parseInt(process.argv[3] ?? "11000", 10);

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function parseSections(text) {
  const preamble = [];
  const sections = [];
  let current = null;
  let italicDone = false;

  for (const line of text.split("\n")) {
    if (line.startsWith("## ")) {
      if (current) sections.push(current);
      current = { header: line, italicLines: [], indexLines: [], bodyLines: [] };
      italicDone = false;
      continue;
    }
    if (current) {
      if (!italicDone && line.startsWith("_") && line.trim().endsWith("_")) {
        current.italicLines.push(line);
        continue;
      }
      if (line.trim() !== "" && !(line.startsWith("_") && line.trim().endsWith("_"))) {
        italicDone = true;
      }
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

function readBudgeted(body, budgetTokens) {
  if (!body || body.length === 0) return { text: "", truncated: false };
  const totalTokens = estimateTokens(body);
  if (totalTokens <= budgetTokens) return { text: body, truncated: false };

  const { preamble, sections } = parseSections(body);
  if (sections.length === 0) {
    const ratio = budgetTokens / totalTokens;
    const cutLen = Math.floor(body.length * ratio * 0.95);
    return { text: body.slice(0, cutLen) + `\n\n⚠️ Truncated at ~${budgetTokens} tokens. Read("${CHECKPOINT_PATH}") for full content.`, truncated: true };
  }

  const skeletonParts = [...preamble, ...sections.flatMap((s) => [s.header, ...s.italicLines, ...s.indexLines])];
  const skeletonTokens = estimateTokens(skeletonParts.join("\n"));
  if (skeletonTokens >= budgetTokens) {
    const minimalSkeleton = [...preamble, ...sections.flatMap((s) => [s.header, ...s.italicLines, ...s.indexLines, ""])].join("\n");
    return { text: minimalSkeleton + `\n\n⚠️ Truncated at ~${budgetTokens} tokens. Read("${CHECKPOINT_PATH}") for full content.`, truncated: true };
  }

  const out = [...preamble];
  let used = estimateTokens(out.join("\n"));
  for (const sec of sections) {
    const headerPart = [sec.header, ...sec.italicLines, ...sec.indexLines].join("\n");
    out.push(headerPart);
    used += estimateTokens(headerPart);
    const fullBody = sec.bodyLines.join("\n");
    const bodyTokens = estimateTokens(fullBody);
    if (used + bodyTokens <= budgetTokens) {
      out.push(fullBody);
      used += bodyTokens;
    } else {
      const remaining = budgetTokens - used;
      if (remaining > 20) {
        const ratio = remaining / bodyTokens;
        const cutLen = Math.floor(fullBody.length * ratio * 0.95);
        const lastNl = fullBody.lastIndexOf("\n", cutLen);
        out.push(lastNl > 0 ? fullBody.slice(0, lastNl) : fullBody.slice(0, cutLen));
        used += remaining;
      }
    }
    out.push("");
  }
  return { text: out.join("\n") + `\n\n⚠️ Truncated at ~${budgetTokens} tokens. Read("${CHECKPOINT_PATH}") for full content.`, truncated: true };
}

// Main — fail-open
try {
  const absPath = resolve(CHECKPOINT_PATH);
  const body = readFileSync(absPath, "utf-8");
  const result = readBudgeted(body, BUDGET_TOKENS);
  process.stdout.write(result.text);
} catch {
  // Fail-open: output nothing, hook falls back to raw snapshot.
}
