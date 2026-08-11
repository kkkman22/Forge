/**
 * Evolved rules violation detection (pure functions).
 *
 * Scans recent Events_NDJSON / session logs for patterns that indicate
 * an evolved rule was either violated or successfully guarded. When found,
 * produces a map of `ruleId → ISO date` to update each rule's
 * `Last_triggered` field.
 *
 * Rationale: `Last_triggered` should reflect real evidence, not manual edits.
 * Every rule has a declarative `patterns[]` specification that describes what
 * text signals a trigger. Matches drive the `Last_triggered` update.
 *
 * Keeping the logic pure enables:
 *   - property tests against arbitrary event streams
 *   - local preview of "which rules would trigger" before committing
 *   - future integration with CI (fail PR on never-triggered rules)
 */

/** A declarative pattern that signals a rule was observed. */
export interface RuleSignal {
  /** Rule ID this signal belongs to (e.g. "R1"). */
  ruleId: string;
  /**
   * Regex source (string). Case-insensitive match is always applied.
   * Matches against a single event's serialized text.
   */
  pattern: string;
  /**
   * Type of match:
   *   - "violation": rule was broken (AI did the forbidden thing)
   *   - "guard":     rule was successfully enforced (hook blocked, AI self-corrected)
   * Both types count as "triggered" — presence in the session means the
   * rule is still relevant.
   */
  type: "violation" | "guard";
}

/** Output of the violation scanner. */
export interface TriggerReport {
  /** rule id → most recent ISO date (YYYY-MM-DD) where a signal matched. */
  triggers: Map<string, string>;
  /** Per-rule counts, useful for staleness trending. */
  counts: Map<string, { violations: number; guards: number }>;
}

/**
 * Built-in signal catalogue for the canonical R1-R5 (post-retirement) rules.
 *
 * Patterns are intentionally conservative: they match text that would ONLY
 * appear when the rule's specific concern is at play. We prefer false
 * negatives (under-count) to false positives (which would artificially keep
 * retired rules "fresh").
 *
 * Reference: `.tinkerman/knowledge/evolved-rules.md`
 */
export const DEFAULT_SIGNALS: readonly RuleSignal[] = [
  // R1 — Implicit Idle Is Also a Block
  { ruleId: "R1", pattern: "是否继续", type: "violation" },
  { ruleId: "R1", pattern: "Ready to proceed", type: "violation" },
  { ruleId: "R1", pattern: "自动进入\\s*\\w+", type: "guard" },

  // R2 — Review 必须对新增文件做主分支存在性验证
  { ruleId: "R2", pattern: "worktree 中存在", type: "violation" },
  { ruleId: "R2", pattern: "claimed new file", type: "guard" },
  { ruleId: "R2", pattern: "主分支.*存在性", type: "guard" },

  // R3 — Pack/Loader 约定差异必须有运行时验证
  { ruleId: "R3", pattern: "pack-integration\\.test", type: "guard" },
  { ruleId: "R3", pattern: "load\\w+\\(enabledPacks\\)", type: "guard" },

  // R4 — Stub With TODO 不是 Zero-Pack 合理降级
  { ruleId: "R4", pattern: "Stub Detection", type: "guard" },
  { ruleId: "R4", pattern: "return \\{\\};\\s*//\\s*TODO", type: "violation" },

  // R5 — Lint 严格度按源码/测试分层
  { ruleId: "R5", pattern: "biome-ignore", type: "violation" },
  { ruleId: "R5", pattern: '"noNonNullAssertion":\\s*"off"', type: "guard" },
];

/**
 * Scan arbitrary text (concatenated session logs / event lines / PR diffs)
 * for rule signals.
 *
 * Each signal's regex is applied with `gi` flags; the scanner emits a trigger
 * for the rule's id when any match occurs. The `sessionDate` parameter
 * should be the ISO date representing "when this scan corresponds to" — it
 * becomes the new `Last_triggered` value for matching rules.
 */
export function scanForTriggers(
  text: string,
  sessionDate: string,
  signals: readonly RuleSignal[] = DEFAULT_SIGNALS,
): TriggerReport {
  const triggers = new Map<string, string>();
  const counts = new Map<string, { violations: number; guards: number }>();

  for (const signal of signals) {
    let re: RegExp;
    try {
      re = new RegExp(signal.pattern, "gi");
    } catch (_err: unknown) {
      // Invalid pattern — skip silently (upstream catalogue is trusted)
      continue;
    }

    const matches = text.match(re);
    if (!matches || matches.length === 0) continue;

    // Update trigger date (always use sessionDate; caller decides freshness)
    triggers.set(signal.ruleId, sessionDate);

    // Update per-rule counts
    const current = counts.get(signal.ruleId) ?? { violations: 0, guards: 0 };
    if (signal.type === "violation") current.violations += matches.length;
    else current.guards += matches.length;
    counts.set(signal.ruleId, current);
  }

  return { triggers, counts };
}

/**
 * Apply a TriggerReport to a rule file body by updating each rule's
 * `Last_triggered:` line. Returns the new body.
 *
 * Non-matching rules keep their existing `Last_triggered` value. Rules
 * without a `Last_triggered` line get one inserted after `**Confidence**:`.
 * If no `**Confidence**:` anchor exists (shouldn't happen with compliant
 * rules), the line is appended at the end of the rule block.
 */
export function applyTriggerUpdates(body: string, report: TriggerReport): string {
  if (report.triggers.size === 0) return body;

  // Walk the body rule-by-rule, rewriting Last_triggered on match.
  const headingRe = /^###\s+(R\d+):[^\n]*$/gm;
  const segments: { id: string | null; start: number; end: number }[] = [];
  let prevMatch: RegExpExecArray | null = null;
  let prevIdx = 0;
  let m: RegExpExecArray | null = headingRe.exec(body);
  while (m !== null) {
    if (prevMatch !== null) {
      segments.push({ id: prevMatch[1], start: prevIdx, end: m.index });
    } else if (m.index > 0) {
      segments.push({ id: null, start: 0, end: m.index });
    }
    prevMatch = m;
    prevIdx = m.index;
    m = headingRe.exec(body);
  }
  if (prevMatch !== null) {
    segments.push({ id: prevMatch[1], start: prevIdx, end: body.length });
  } else {
    segments.push({ id: null, start: 0, end: body.length });
  }

  const updated = segments.map((seg) => {
    const block = body.slice(seg.start, seg.end);
    if (seg.id === null) return block;
    const newDate = report.triggers.get(seg.id);
    if (!newDate) return block;
    return rewriteLastTriggered(block, newDate);
  });

  return updated.join("");
}

/** Replace or insert `**Last_triggered**: {date}` within a rule block. */
function rewriteLastTriggered(block: string, date: string): string {
  const lineRe = /^\*\*Last_triggered\*\*:\s*.+$/im;
  if (lineRe.test(block)) {
    return block.replace(lineRe, `**Last_triggered**: ${date}`);
  }
  // Insert after **Confidence**: line
  const confidenceRe = /^(\*\*Confidence\*\*:\s*.+)$/im;
  if (confidenceRe.test(block)) {
    return block.replace(confidenceRe, `$1\n**Last_triggered**: ${date}`);
  }
  // Fallback: append at end (preserving trailing newline)
  const trailing = block.endsWith("\n") ? "" : "\n";
  return `${block}${trailing}**Last_triggered**: ${date}\n`;
}
