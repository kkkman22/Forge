/**
 * Acceptance report rendering — extracted from accept-driver.ts (P3-1 god-file
 * split). Pure functions over AcceptanceRunResult.
 */

import type { AcceptanceRunResult, ScenarioArtifact, Verdict } from "../accept.js";

export function renderAcceptanceReport(result: AcceptanceRunResult): string {
  const total = result.scenarios.length;
  const lines: string[] = [
    `# Acceptance Report — ${result.topic}`,
    "",
    "## Summary",
    "",
    `Run: ${total} scenario${total === 1 ? "" : "s"}${result.summary.skip > 0 ? ` (${result.summary.skip} skipped, --all to show)` : ""}`,
    "",
    `| Verdict | Count |`,
    `|---------|-------|`,
    `| PASS    | ${result.summary.pass} |`,
    `| FAIL    | ${result.summary.fail} |`,
    `| SKIP    | ${result.summary.skip} |`,
    `| WARN    | ${result.summary.warn} |`,
    `| INCONCLUSIVE | ${result.summary.inconclusive} |`,
    "",
    `**Blocks Ship**: ${result.summary.blocksShip ? "YES" : "NO"}`,
    "",
  ];

  // Req5 AC4: surface per-layer health + pyramid shape (advisory signal).
  if (result.summary.pyramidShape) {
    lines.push(`**Pyramid Shape**: ${result.summary.pyramidShape}`);
    const lh = result.summary.layerHealth;
    if (lh) {
      lines.push("");
      lines.push("| Layer | PASS | FAIL | INCONCLUSIVE |");
      lines.push("|-------|------|------|--------------|");
      for (const layer of ["unit", "component", "contract", "e2e"] as const) {
        const h = lh[layer];
        lines.push(`| ${layer} | ${h.pass} | ${h.fail} | ${h.inconclusive} |`);
      }
    }
    lines.push("");
  }

  lines.push("## Scenarios", "");

  for (const s of result.scenarios) {
    const marker = verdictMarker(s.verdict);
    // R5-AC3: PASS collapses to a single line.
    if (s.verdict === "PASS" || s.verdict === "SKIP" || s.verdict === "WARN") {
      lines.push(`- ${marker} \`${s.scenarioId}\` — ${s.verdict}`);
      continue;
    }
    // FAIL / INCONCLUSIVE expand with detail.
    lines.push(`### ${marker} ${s.scenarioId} — ${s.verdict}`);
    if (s.verdict === "INCONCLUSIVE") {
      lines.push("");
      lines.push("> 这不是失败——是当前环境无法验证，不阻断 ship。");
    }
    // R5-AC2: render Given/When/Then original text; highlight the Then clause on FAIL.
    if (s.givenWhenThen) {
      lines.push("");
      lines.push("**Scenario**:");
      lines.push("");
      for (const line of s.givenWhenThen.split("\n")) {
        const isThen = /^\s*(Then|那么)/i.test(line);
        const emphasize = s.verdict === "FAIL" && isThen;
        lines.push(emphasize ? `> **${line}** ← 未满足` : `> ${line}`);
      }
    }
    if (s.failureReason) {
      lines.push("");
      lines.push(`- **Reason**: ${s.failureReason}`);
    }
    // R5-AC4: Next → heuristic hint.
    lines.push("");
    lines.push(`- **Next →** ${nextHint(s)}`);
    // R5-AC3: evidence folded in <details>.
    if (s.evidence.length > 0) {
      lines.push("");
      lines.push("<details><summary>Evidence</summary>");
      lines.push("");
      for (const e of s.evidence) {
        lines.push(`- ${e}`);
      }
      lines.push("");
      lines.push("</details>");
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** R5-AC1 visual marker per verdict. */
function verdictMarker(v: Verdict): string {
  switch (v) {
    case "PASS":
      return "✅";
    case "FAIL":
      return "❌";
    case "INCONCLUSIVE":
      return "❔";
    case "WARN":
      return "🟡";
    default:
      return "⏭️";
  }
}

/** R5-AC4 heuristic next-step hint per scenario type/verdict. */
function nextHint(s: ScenarioArtifact): string {
  if (s.verdict === "INCONCLUSIVE") {
    return "确认 agent-browser 已安装、dev server 已启动，或改用 Playwright e2e。";
  }
  if (s.verdict === "FAIL") {
    const reason = s.failureReason ?? "";
    // UI jump/redirect failures
    if (/跳转|jump|redirect|dashboard|navigation/i.test(reason)) {
      return "UI 跳转未发生，检查路由守卫/鉴权返回。";
    }
    // Assertion mismatch (THEN not satisfied)
    if (/THEN not satisfied|assertion|snapshot/i.test(reason)) {
      return "THEN 预期与实际页面不符：核对断言关键词、或用 /forge test 跑单元层定位。";
    }
    // API http code mismatch
    if (/http|code|401|403|500|api/i.test(reason)) {
      return "API 返回码不符：检查路由/鉴权中间件，或用 /forge test 跑单元层。";
    }
    // CLI exit code
    if (/exit|command|cli|stderr/i.test(reason)) {
      return "CLI 命令失败：查看 stderr evidence 块，确认命令与依赖。";
    }
    return "核对 THEN 预期与实际 snapshot 差异；用 /forge test 跑单元层定位。";
  }
  return "—";
}
