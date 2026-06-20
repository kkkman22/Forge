export type ScenarioSource = "explicit" | "derived";
/**
 * Scenario execution type (ADR-0006).
 *
 * Layered additions (Req2): unit / component / contract are the three cheap
 * delegate layers. api/ui/cli run as real end-to-end (curl/browser/shell);
 * mixed is retained for back-compat with parsed legacy specs but no runner
 * serves it; unknown is the pre-classification default.
 */
export type ScenarioType =
  | "unit"
  | "component"
  | "contract"
  | "api"
  | "ui"
  | "cli"
  | "mixed"
  | "unknown";
export type Verdict = "PASS" | "FAIL" | "SKIP" | "WARN" | "INCONCLUSIVE";

export interface Scenario {
  id: string;
  given: string;
  when: string;
  then: string;
  source: ScenarioSource;
  type: ScenarioType;
  tags: readonly string[];
  confidence: number;
  rawText: string;
}

export interface ScenarioArtifact {
  scenarioId: string;
  source: ScenarioSource;
  givenWhenThen: string;
  executedAt: string;
  verdict: Verdict;
  evidence: readonly string[];
  failureReason?: string;
  /**
   * Scenario type (ADR-0006), used by aggregateVerdicts to group per pyramid
   * layer. Optional for back-compat with artifacts produced before the layered
   * model; artifacts without a type are not counted in any layer.
   */
  type?: ScenarioType;
}

export interface AcceptanceRunResult {
  topic: string;
  scenarios: readonly ScenarioArtifact[];
  summary: {
    pass: number;
    fail: number;
    skip: number;
    warn: number;
    inconclusive: number;
    blocksShip: boolean;
    /** Req5 AC4: per-layer health + pyramid shape surfaced in the artifact. */
    layerHealth?: {
      unit: { pass: number; fail: number; inconclusive: number };
      component: { pass: number; fail: number; inconclusive: number };
      contract: { pass: number; fail: number; inconclusive: number };
      e2e: { pass: number; fail: number; inconclusive: number };
    };
    pyramidShape?: string;
  };
}

// ---------------------------------------------------------------------------
// Explicit Scenario Parsing
// ---------------------------------------------------------------------------

export function parseExplicitScenarios(specContent: string): readonly Scenario[] {
  const scenarios: Scenario[] = [];
  const lines = specContent.split("\n");
  let inScenarioBlock = false;
  let currentRaw: string[] = [];
  let currentTags: string[] = [];
  let scenarioCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (/^##\s+Scenarios?\s*$/i.test(trimmed)) {
      inScenarioBlock = true;
      continue;
    }

    if (inScenarioBlock && /^##\s/.test(trimmed) && !/^##\s+Scenarios?\s*$/i.test(trimmed)) {
      inScenarioBlock = false;
      flushCurrent();
      continue;
    }

    if (!inScenarioBlock) continue;

    const tagMatch = trimmed.match(/^(@[\w-]+)/);
    if (tagMatch && currentRaw.length === 0) {
      currentTags.push(tagMatch[1]);
      continue;
    }

    if (/^Scenario:/i.test(trimmed) || /^###\s+Scenario:/i.test(trimmed)) {
      flushCurrent();
      scenarioCounter++;
      currentRaw = [trimmed];
      continue;
    }

    if (currentRaw.length > 0 || (inScenarioBlock && trimmed.length > 0)) {
      currentRaw.push(line);
    }
  }

  flushCurrent();

  function flushCurrent() {
    if (currentRaw.length === 0) return;
    const raw = currentRaw.join("\n");
    const tags = [...currentTags];
    currentTags = [];

    const given = extractClause(raw, "Given");
    const when = extractClause(raw, "When");
    const then = extractClause(raw, "Then");

    if (!given && !when && !then) {
      currentRaw = [];
      return;
    }

    scenarios.push({
      id: `scenario-explicit-${scenarioCounter}`,
      given: given || "",
      when: when || "",
      // biome-ignore lint/suspicious/noThenProperty: Gherkin clause field
      then: then || "",
      source: "explicit",
      type: "unknown",
      tags,
      confidence: 1.0,
      rawText: raw,
    });

    currentRaw = [];
  }

  return scenarios;
}

function extractClause(text: string, keyword: string): string | null {
  const re = new RegExp(`${keyword}\\s+(.+?)(?=\\n(?:Given|When|Then|Scenario|$))`, "is");
  const match = re.exec(text);
  return match ? match[1].trim() : null;
}

// ---------------------------------------------------------------------------
// Implicit Scenario Derivation
// ---------------------------------------------------------------------------

export interface AcceptanceCriterion {
  text: string;
}

const WHEN_SHALL_RE = /WHEN\s+(.+?),\s*(?:THE\s+)?(.+?)\s+SHALL\s+(.+?)(?:\.|$)/i;

export function deriveScenariosFromCriteria(
  criteria: readonly AcceptanceCriterion[],
): readonly Scenario[] {
  const scenarios: Scenario[] = [];

  for (let i = 0; i < criteria.length; i++) {
    const c = criteria[i];
    const match = WHEN_SHALL_RE.exec(c.text);
    if (!match) continue;

    scenarios.push({
      id: `scenario-derived-${i + 1}`,
      given: "",
      when: match[1].trim(),
      // biome-ignore lint/suspicious/noThenProperty: Gherkin clause field
      then: `${match[2].trim()} shall ${match[3].trim()}`,
      source: "derived",
      type: "unknown",
      tags: [],
      confidence: 0.7,
      rawText: c.text,
    });
  }

  return scenarios;
}

// ---------------------------------------------------------------------------
// Unified Entry
// ---------------------------------------------------------------------------

export function parseScenariosFromSpec(specContent: string): readonly Scenario[] {
  const explicit = parseExplicitScenarios(specContent);

  const criteria: AcceptanceCriterion[] = [];
  const lines = specContent.split("\n");
  let inCriteria = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^##\s+Acceptance\s+Criteria/i.test(trimmed)) {
      inCriteria = true;
      continue;
    }
    if (inCriteria && /^##\s/.test(trimmed)) {
      inCriteria = false;
      continue;
    }
    if (inCriteria && trimmed.length > 0 && /^[*-]\s/.test(trimmed)) {
      criteria.push({ text: trimmed.replace(/^[*-]\s*/, "") });
    }
  }

  const derived = deriveScenariosFromCriteria(criteria);

  // Deduplicate by `then` clause similarity
  const seen = new Set<string>();
  const all = [...explicit];
  for (const e of explicit) {
    seen.add(e.then.toLowerCase().replace(/\s+/g, " "));
  }
  for (const d of derived) {
    const key = d.then.toLowerCase().replace(/\s+/g, " ");
    if (!seen.has(key)) {
      seen.add(key);
      all.push(d);
    }
  }

  return all;
}

// ---------------------------------------------------------------------------
// Selection & Sorting
// ---------------------------------------------------------------------------

export interface SelectionOptions {
  maxCount?: number;
  explicitIds?: readonly string[];
  promoteDerived?: boolean;
}

export function selectScenariosForRun(
  scenarios: readonly Scenario[],
  options?: SelectionOptions,
): readonly Scenario[] {
  const maxCount = options?.maxCount ?? 5;
  let pool = [...scenarios];

  if (options?.explicitIds && options.explicitIds.length > 0) {
    const idSet = new Set(options.explicitIds);
    pool = pool.filter((s) => idSet.has(s.id));
  }

  if (!options?.promoteDerived) {
    // Derived scenarios don't block ship by default
  }

  pool.sort((a, b) => {
    const tagPriority = (s: Scenario) => {
      if (s.tags.includes("@critical")) return 0;
      if (s.tags.includes("@happy-path")) return 1;
      return 2;
    };
    const ta = tagPriority(a);
    const tb = tagPriority(b);
    if (ta !== tb) return ta - tb;
    if (a.source === "explicit" && b.source !== "explicit") return -1;
    if (a.source !== "explicit" && b.source === "explicit") return 1;
    return b.confidence - a.confidence;
  });

  return pool.slice(0, maxCount);
}

// ---------------------------------------------------------------------------
// Type Classification
// ---------------------------------------------------------------------------

const API_KEYWORDS = [
  "api",
  "endpoint",
  "request",
  "response",
  "http",
  "get ",
  "post ",
  "put ",
  "delete ",
  "patch ",
  "status code",
  "curl",
  "fetch(",
];
const UI_KEYWORDS = [
  "click",
  "button",
  "input",
  "form",
  "page",
  "navigate",
  "visible",
  "displayed",
  "ui",
  "modal",
  "dialog",
  "dropdown",
  "select",
  "checkbox",
  "screenshot",
  "viewport",
];
const CLI_KEYWORDS = [
  "\\bcli\\b",
  "command line",
  "terminal",
  "\\bbash\\b",
  "shell",
  "exit code",
  "stdout",
  "stderr",
  "\\bspawn\\b",
  "\\bexec\\b",
];

export function classifyScenarioType(scenario: Scenario): ScenarioType {
  const text = `${scenario.given} ${scenario.when} ${scenario.then}`.toLowerCase();

  const hasApi = API_KEYWORDS.some((k) => text.includes(k));
  const hasUi = UI_KEYWORDS.some((k) => text.includes(k));
  const hasCli = CLI_KEYWORDS.some((k) => new RegExp(k).test(text));

  const hits = [hasApi, hasUi, hasCli].filter(Boolean).length;
  if (hits === 0) return "unknown";
  if (hits > 1) return "mixed";
  if (hasApi) return "api";
  if (hasUi) return "ui";
  return "cli";
}
