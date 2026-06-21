/**
 * Plan Pre-flight Check (spec `plan-pre-flight-check`).
 *
 * Problem (obra/superpowers v6.0.0): the 4 existing build gates check external
 * state (spec locked / plan approved / dir exists / branch correct), but none
 * checks the plan document's *internal* consistency. Plans with inter-task
 * conflicts or self-defeating instructions (e.g. "write implementation first,
 * add tests later" — a TDD violation) are only caught mid-build or at review,
 * after burning execution tokens.
 *
 * This module is a pure, IO-free pre-flight that scans a plan document's text
 * for two classes of issues and reports them all at once (fail-fast):
 *
 *   R2 internal conflicts:
 *     - AC1 file-operation conflict (a file DELETEd by one task referenced by a later task)
 *     - AC2 dependency cycle / depends-on-future-task
 *     - AC3 Spec Coverage gap (a spec requirement with no covering task)
 *     - AC4 Verify command not in whitelist
 *     - AC5 duplicate task titles
 *   R3 self-defeating instructions:
 *     - AC1 TDD violation phrasing
 *     - AC2 skip-verification phrasing
 *     - AC3 mid-step-confirmation phrasing
 *     - AC4 missing RED step (full format only)
 *
 * Exemption: a task may carry `<!-- preflight-exempt: <rule> reason: <...> -->`
 * to suppress a flagged rule for that task (R4.AC2).
 */

/** One detected violation. */
export interface PreflightViolation {
  /** Rule id, e.g. "R2.AC1 文件操作冲突". */
  rule: string;
  /** Task ids involved (e.g. ["T-01", "T-03"]). */
  task_ids: string[];
  /** Concrete evidence from the plan text. */
  evidence: string;
}

/** Outcome of running the pre-flight. */
export type PreflightResult =
  | { kind: "pass"; checks_run: number; checks_triggered: 0 }
  | { kind: "fail"; violations: PreflightViolation[] };

/** Whitelist of allowed Verify-By values (config may override). */
export const DEFAULT_VERIFY_WHITELIST = [
  "vitest:unit",
  "vitest:component",
  "bash:contract",
  "forge_exec:e2e",
  "manual",
];

/** R3.AC1 TDD-violation keyword patterns (conservative; prefer false-negatives). */
const TDD_VIOLATION_PATTERNS = [
  /先写实现.*再补测试/,
  /先实现.*后补.*测试/,
  /代码先行.*测试后补/,
  /实现优先.*测试后补/,
  /写实现.*补测试/,
];

/** R3.AC2 skip-verification patterns. */
const SKIP_VERIFICATION_PATTERNS = [
  /跳过\s*verify/,
  /跳过验证/,
  /手动验证即可/,
  /测试以后再补/,
  /测试后续补/,
];

/** R3.AC3 mid-step-confirmation patterns. */
const MID_STEP_CONFIRMATION_PATTERNS = [
  /询问用户是否继续/,
  /等用户确认再下一步/,
  /停下来等.*确认/,
  /完成后请.*确认/,
];

/** A parsed task block from the plan. */
interface ParsedTask {
  id: string;
  title: string;
  body: string;
  /** Raw lowercased body for keyword scans. */
  bodyLower: string;
  /** Files this task declares (rough extraction). */
  dependsOn: string[];
  /** Files referenced in a File field. */
  file: string | null;
  /** Verify command text. */
  verify: string | null;
}

/**
 * Extract task blocks from plan markdown. Tolerant: matches `### Task N` and
 * `#### T-NN` headings. Returns [] when the plan has no task headings (caller
 * treats as "no tasks to check" — not a violation).
 */
export function parseTasks(planText: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];
  // Match headings: "### Task 1: ..." or "#### T-01 ..." or "### Task 1 ..."
  const headingRe = /^#{3,4}\s+(?:Task\s+(\d+)|T-(\d+))[:：\s]+(.+)$/gmu;
  const lines = planText.split("\n");
  let current: ParsedTask | null = null;
  const headingLineIndices = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    headingRe.lastIndex = 0;
    const m = headingRe.exec(line);
    if (m) {
      if (current) tasks.push(current);
      const num = m[1] ?? m[2];
      current = {
        id: `T-${num.padStart(2, "0")}`,
        title: m[3].trim(),
        body: "",
        bodyLower: "",
        dependsOn: [],
        file: null,
        verify: null,
      };
      headingLineIndices.add(i);
    } else if (current) {
      current.body += `${line}\n`;
      const lower = line.toLowerCase();
      current.bodyLower += `${lower}\n`;
      // extract Depends On (tolerate surrounding ** and backticks: "**Depends On**: `[1, 2]`")
      const depMatch = line.match(/Depends On\**\s*[:：]\s*`?\[([^\]]*)\]/i);
      if (depMatch) {
        current.dependsOn = depMatch[1]
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
      }
      // extract File (tolerate ** and backticks)
      const fileMatch = line.match(/\*{0,2}File\*{0,2}\s*[:：]\s*`?([^`\n]+)`?/i);
      if (fileMatch) current.file = fileMatch[1].trim();
      // extract Verify (tolerate ** and backticks)
      const verifyMatch = line.match(
        /\*{0,2}Verify(?:\s+Command)?\*{0,2}\s*[:：]\s*`?([^`\n]+)`?/i,
      );
      if (verifyMatch) current.verify = verifyMatch[1].trim();
    }
  }
  if (current) tasks.push(current);
  return tasks;
}

/** Extract the Spec Coverage table rows (requirement → covering tasks). */
function extractSpecCoverage(
  planText: string,
): { requirement: string; hasCoveringTask: boolean }[] {
  const rows: { requirement: string; hasCoveringTask: boolean }[] = [];
  const tableRe = /^\|\s*(Requirement[^|]*|需求[^|]*)\s*\|([^|]*)\|/gmu;
  let inCoverageTable = false;
  for (const line of planText.split("\n")) {
    if (/^##.*Spec Coverage/i.test(line) || /^##.*需求覆盖/i.test(line)) {
      inCoverageTable = true;
      continue;
    }
    if (inCoverageTable && line.startsWith("|")) {
      if (/^\|\s*[-:|\s]+\s*\|/.test(line)) continue; // separator
      const m = line.match(/^\|\s*([^|]+)\s*\|\s*([^|]*)\s*\|/);
      if (m) {
        const covering = m[2].trim();
        rows.push({
          requirement: m[1].trim(),
          hasCoveringTask: covering.length > 0 && covering.toLowerCase() !== "none",
        });
      }
    } else if (inCoverageTable && line.trim() && !line.startsWith("|")) {
      inCoverageTable = false;
    }
  }
  return rows;
}

/** R2.AC1: a task DELETEs a file that a later task references. */
function detectFileOperationConflicts(tasks: ParsedTask[]): PreflightViolation[] {
  const violations: PreflightViolation[] = [];
  const deletedFiles = new Map<string, string>(); // file → task id that deletes it
  for (const t of tasks) {
    const deleteMatch = t.body.match(/Operation[:：]\s*DELETE|删除\s*`?([^`\s]+)`?/i);
    if (deleteMatch) {
      // try to find a file path near the DELETE
      const fileMatch = t.body.match(/`([^`]+\.[a-z]+)`/i);
      if (fileMatch) deletedFiles.set(fileMatch[1], t.id);
    }
  }
  for (const t of tasks) {
    if (!t.file) continue;
    const deleter = deletedFiles.get(t.file);
    if (deleter && deleter !== t.id) {
      violations.push({
        rule: "R2.AC1 文件操作冲突",
        task_ids: [deleter, t.id],
        evidence: `${deleter} DELETE ${t.file}，但 ${t.id} 引用该文件`,
      });
    }
  }
  return violations;
}

/** R2.AC2: dependency cycle or depends-on-future-task. */
function detectDependencyCycles(tasks: ParsedTask[]): PreflightViolation[] {
  const violations: PreflightViolation[] = [];
  const idToIndex = new Map(tasks.map((t, i) => [t.id, i]));
  for (const t of tasks) {
    const myIndex = idToIndex.get(t.id) ?? -1;
    for (const dep of t.dependsOn) {
      const depId = dep.startsWith("T-") ? dep : `T-${dep.padStart(2, "0")}`;
      const depIndex = idToIndex.get(depId);
      if (depIndex === undefined) continue; // unknown dep — not our concern here
      if (depIndex > myIndex) {
        violations.push({
          rule: "R2.AC2 依赖反向",
          task_ids: [t.id, depId],
          evidence: `${t.id} Depends On ${depId}，但 ${depId} 编号更大（顺序倒置）`,
        });
      }
      if (depId === t.id) {
        violations.push({
          rule: "R2.AC2 依赖循环",
          task_ids: [t.id],
          evidence: `${t.id} Depends On 自身`,
        });
      }
    }
  }
  return violations;
}

/** R2.AC3: a spec requirement with no covering task. */
function detectSpecCoverageGaps(planText: string): PreflightViolation[] {
  const rows = extractSpecCoverage(planText);
  return rows
    .filter((r) => !r.hasCoveringTask)
    .map((r) => ({
      rule: "R2.AC3 Spec Coverage 缺口",
      task_ids: [],
      evidence: `${r.requirement} 在 Spec Coverage 表中无 Covering Task`,
    }));
}

/** R2.AC4: Verify command not in whitelist. */
function detectVerifyWhitelistViolations(
  tasks: ParsedTask[],
  whitelist: string[],
): PreflightViolation[] {
  const violations: PreflightViolation[] = [];
  const wl = new Set(whitelist.map((w) => w.toLowerCase()));
  for (const t of tasks) {
    if (!t.verify) continue;
    // extract the verify-by token if present (e.g. "vitest:unit")
    const verifyLower = t.verify.toLowerCase();
    const hasWhitelisted = [...wl].some((w) => verifyLower.includes(w));
    // Only flag if the verify text looks like a verify-by token but isn't whitelisted.
    // A free-form command like "npx vitest run ..." is fine (it's a command, not a verify-by label).
    if (!hasWhitelisted && /^vitest|^bash|^forge_exec/.test(verifyLower)) {
      violations.push({
        rule: "R2.AC4 Verify 白名单违规",
        task_ids: [t.id],
        evidence: `${t.id} Verify "${t.verify}" 不在白名单 [${whitelist.join(", ")}]`,
      });
    }
  }
  return violations;
}

/** R2.AC5: duplicate task titles. */
function detectDuplicateTaskTitles(tasks: ParsedTask[]): PreflightViolation[] {
  const violations: PreflightViolation[] = [];
  const seen = new Map<string, string[]>();
  for (const t of tasks) {
    const key = t.title.toLowerCase();
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key)?.push(t.id);
  }
  for (const [title, ids] of seen) {
    if (ids.length > 1) {
      violations.push({
        rule: "R2.AC5 重复 Task 标题",
        task_ids: ids,
        evidence: `标题 "${title}" 被 ${ids.length} 个 task 重复使用：${ids.join(", ")}`,
      });
    }
  }
  return violations;
}

/** Scan a task body for any matching regex pattern; returns the first match. */
function matchAny(text: string, patterns: RegExp[]): RegExp | null {
  for (const p of patterns) {
    if (p.test(text)) return p;
  }
  return null;
}

/** R3.AC1-AC3: keyword-based self-defeating instruction detection. */
function detectSelfDefeatingInstructions(tasks: ParsedTask[]): PreflightViolation[] {
  const violations: PreflightViolation[] = [];
  for (const t of tasks) {
    if (matchAny(t.bodyLower, TDD_VIOLATION_PATTERNS)) {
      violations.push({
        rule: "R3.AC1 TDD 违规",
        task_ids: [t.id],
        evidence: `${t.id} 含"先写实现再补测试"类表述`,
      });
    }
    if (matchAny(t.bodyLower, SKIP_VERIFICATION_PATTERNS)) {
      violations.push({
        rule: "R3.AC2 跳过验证",
        task_ids: [t.id],
        evidence: `${t.id} 含"跳过 verify/测试以后再补"类表述`,
      });
    }
    if (matchAny(t.bodyLower, MID_STEP_CONFIRMATION_PATTERNS)) {
      violations.push({
        rule: "R3.AC3 阶段间确认",
        task_ids: [t.id],
        evidence: `${t.id} 含"询问用户是否继续"类表述`,
      });
    }
  }
  return violations;
}

/** R3.AC4: missing RED step (full format only — heuristic: task with GREEN but no RED). */
function detectMissingRed(tasks: ParsedTask[]): PreflightViolation[] {
  const violations: PreflightViolation[] = [];
  for (const t of tasks) {
    const hasGreen = /GREEN/i.test(t.body);
    const hasRed = /RED/i.test(t.body);
    if (hasGreen && !hasRed) {
      violations.push({
        rule: "R3.AC4 RED 缺失",
        task_ids: [t.id],
        evidence: `${t.id} 有 GREEN 但无 RED 段（full format TDD 违规）`,
      });
    }
  }
  return violations;
}

/** Apply `<!-- preflight-exempt: <rule> reason: <...> -->` comments (R4.AC2). */
function applyExemptions(violations: PreflightViolation[], planText: string): PreflightViolation[] {
  const exemptRe = /preflight-exempt:\s*(R[23]\.AC\d)[^\n]*>/giu;
  const exempted = new Set<string>();
  let m: RegExpExecArray | null = exemptRe.exec(planText);
  while (m !== null) {
    exempted.add(m[1]);
    m = exemptRe.exec(planText);
  }
  if (exempted.size === 0) return violations;
  return violations.filter((v) => {
    // exempt by rule id prefix (e.g. "R3.AC1 TDD 违规" starts with "R3.AC1")
    for (const ex of exempted) {
      if (v.rule.startsWith(ex)) return false;
    }
    return true;
  });
}

const TOTAL_RULES = 9; // R2.AC1-AC5 + R3.AC1-AC4

/**
 * Run the plan pre-flight check on a plan document's text.
 *
 * Pure: no IO. Returns pass when no violations remain after exemptions.
 * Callers (build SKILL layer) invoke this after Branch Gate; Light tier skips.
 */
export function runPlanPreflight(args: {
  planText: string;
  verifyWhitelist?: string[];
}): PreflightResult {
  const whitelist = args.verifyWhitelist ?? DEFAULT_VERIFY_WHITELIST;
  const tasks = parseTasks(args.planText);
  const violations: PreflightViolation[] = [];
  violations.push(...detectFileOperationConflicts(tasks));
  violations.push(...detectDependencyCycles(tasks));
  violations.push(...detectSpecCoverageGaps(args.planText));
  violations.push(...detectVerifyWhitelistViolations(tasks, whitelist));
  violations.push(...detectDuplicateTaskTitles(tasks));
  violations.push(...detectSelfDefeatingInstructions(tasks));
  violations.push(...detectMissingRed(tasks));
  const filtered = applyExemptions(violations, args.planText);
  if (filtered.length === 0) {
    return { kind: "pass", checks_run: TOTAL_RULES, checks_triggered: 0 };
  }
  return { kind: "fail", violations: filtered };
}
