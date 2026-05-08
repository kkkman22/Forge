export interface TierAvailability {
  a: true;
  b: "preferred" | "degraded" | "unavailable";
  c: "available" | "unavailable";
  reasons: {
    cmuxSocket: boolean;
    cmuxWorkspaceEnv: boolean;
    cmuxBinary: boolean;
    mcpDevtools: boolean;
  };
}

export function detectTierAvailability(env: {
  socketExists: boolean;
  workspaceIdSet: boolean;
  cmuxBinaryExists: boolean;
  mcpDevtoolsResponsive: boolean;
}): TierAvailability {
  const reasons = {
    cmuxSocket: env.socketExists,
    cmuxWorkspaceEnv: env.workspaceIdSet,
    cmuxBinary: env.cmuxBinaryExists,
    mcpDevtools: env.mcpDevtoolsResponsive,
  };

  let b: TierAvailability["b"];
  if (!env.cmuxBinaryExists) {
    b = "unavailable";
  } else if (env.socketExists && env.workspaceIdSet) {
    b = "preferred";
  } else {
    b = "degraded";
  }

  const c: TierAvailability["c"] = env.mcpDevtoolsResponsive ? "available" : "unavailable";

  return { a: true, b, c, reasons };
}

// ---------------------------------------------------------------------------
// Tier A — Vue3 Static Scan
// ---------------------------------------------------------------------------

export interface VueA11yRule {
  id: string;
  pattern: string;
  severity: "P0" | "P1" | "P2" | "P3";
  wcag: string;
  description: string;
  falsePositiveFilter: readonly string[];
}

export interface Vue3Violation {
  ruleId: string;
  severity: "P0" | "P1" | "P2" | "P3";
  file: string;
  line: number;
  wcag: string;
  snippet: string;
}

export function scanVueTemplate(
  content: string,
  filePath: string,
  rules: readonly VueA11yRule[],
): Vue3Violation[] {
  const violations: Vue3Violation[] = [];
  const lines = content.split("\n");

  for (const rule of rules) {
    try {
      const re = new RegExp(rule.pattern);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!re.test(line)) continue;

        // Check false positive filters
        const isFalsePositive = rule.falsePositiveFilter.some((fp) => line.includes(fp));
        if (isFalsePositive) continue;

        violations.push({
          ruleId: rule.id,
          severity: rule.severity,
          file: filePath,
          line: i + 1,
          wcag: rule.wcag,
          snippet: line.trim(),
        });
      }
    } catch {
      // Invalid regex — skip this rule
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Tier B — axe-core Result Parsing
// ---------------------------------------------------------------------------

export interface AxeViolation {
  id: string;
  impact: "critical" | "serious" | "moderate" | "minor" | string;
  description: string;
  wcag: string[];
  nodes: number;
}

export interface AxeResultSummary {
  p0: number;
  p1: number;
  p2: number;
  p3: number;
  violations: AxeViolation[];
}

const IMPACT_TO_SEVERITY: Record<string, "P0" | "P1" | "P2" | "P3"> = {
  critical: "P0",
  serious: "P1",
  moderate: "P2",
  minor: "P3",
};

export function parseAxeResult(json: unknown): AxeResultSummary {
  const violations: AxeViolation[] = [];
  let p0 = 0;
  let p1 = 0;
  let p2 = 0;
  let p3 = 0;

  const data = json as Record<string, unknown>;
  const rawViolations = Array.isArray(data?.violations) ? data.violations : [];

  for (const v of rawViolations) {
    const entry = v as Record<string, unknown>;
    const impact = String(entry.impact ?? "minor");
    const severity = IMPACT_TO_SEVERITY[impact] ?? "P3";

    switch (severity) {
      case "P0":
        p0++;
        break;
      case "P1":
        p1++;
        break;
      case "P2":
        p2++;
        break;
      case "P3":
        p3++;
        break;
    }

    violations.push({
      id: String(entry.id ?? "unknown"),
      impact,
      description: String(entry.description ?? ""),
      wcag: Array.isArray(entry.tags) ? entry.tags.map(String) : [],
      nodes: Array.isArray(entry.nodes) ? entry.nodes.length : 0,
    });
  }

  return { p0, p1, p2, p3, violations };
}
