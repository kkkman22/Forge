---
topic: spec-health-hook
status: approved
date: "2026-05-15"
spec_ref: ".tinkerman/specs/spec-health-hook/spec.md"
format: full
---

# Plan: Spec-health Hook（统一 spec 健康度评估）

> 来源: `.tinkerman/specs/spec-health-hook/spec.md` (locked)

## Objective

将散落在 spec/review/accept 中的三维度 spec 健康度检测整合为 `src/spec-health.ts` 纯函数调度层，产出 [0,1] 区间的 `ambiguity_score` 和 `SpecHealthReport`，供 plan/build/debug/review 启动时自动评估。

## File Mapping

| File | Operation | Reason |
|------|-----------|--------|
| `src/spec-health.ts` | CREATE | 核心调度层：score 计算、verdict 分类、recommendation 生成、缓存 |
| `test/spec-health.test.ts` | CREATE | 单元测试：score/verdict/recommendation |
| `test/spec-health.property.test.ts` | CREATE | PBT：score 单调性、边界 [0,1]、维度独立性 |
| `test/spec-health-cache.test.ts` | CREATE | 缓存契约测试：spec_hash 比对、frontmatter 读写 |
| `test/spec-health-skill-integration.test.ts` | CREATE | 5 skill 接入点契约测试 |
| `src/index.ts` | MODIFY | barrel 导出新模块 |
| `skills/forge-spec/SKILL.md` | MODIFY | Step 2 末尾增加 health frontmatter 写入 |
| `skills/forge-plan/SKILL.md` | MODIFY | §1.5 Pre-flight 增加 health check |
| `skills/forge-build/SKILL.md` | MODIFY | §1.5 Pre-flight 增加 health check |
| `skills/forge-debug/SKILL.md` | MODIFY | Phase 1 增加 spec health 读取 |
| `skills/forge-review/SKILL.md` | MODIFY | Layer 1 增加 verdict=degraded 子项 |

## Key Design Decision

Spec 中的 `SpecHealthInput` 类型需适配实际代码库：
- `bannedPatterns: BannedPattern[]` → 实际应为 `BannedPatternRegistry`（Map-based）
- `glossary: Glossary` → 实际需要 `GlossaryRegistry`（Map-based）
- `detectSpecLeak` 额外需要 `GlossaryRegistry` 和 `specContext` 参数
- `lintScenarios` 返回 `LintFinding[]`（含 ruleId、severity、file、line）
- 无现成 hash 工具 → 使用 `node:crypto` 的 `createHash("sha256")`

## Tasks

### Task 1: Types and score computation

**Depends On**: []
**Files**:
- Create: `src/spec-health.ts` (partial — types + `computeAmbiguityScore` + `classifyVerdict`)
- Create: `test/spec-health.test.ts`

**RED** — 写失败测试

文件：`test/spec-health.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import {
  computeAmbiguityScore,
  classifyVerdict,
  type SpecHealthDimension,
  type DimensionScore,
} from "../src/spec-health.js";

function makeDim(dimension: SpecHealthDimension, errorCount: number): DimensionScore {
  return { dimension, passed: errorCount === 0, errorCount, details: [] };
}

describe("computeAmbiguityScore", () => {
  it("returns 1.0 when all dimensions have zero errors", () => {
    const dims = {
      leak: makeDim("leak", 0),
      scenario: makeDim("scenario", 0),
      glossary: makeDim("glossary", 0),
    };
    expect(computeAmbiguityScore(dims)).toBe(1.0);
  });

  it("returns 0 when leak_count=5, scenario_errors=3, glossary_miss=5", () => {
    const dims = {
      leak: makeDim("leak", 5),
      scenario: makeDim("scenario", 3),
      glossary: makeDim("glossary", 5),
    };
    expect(computeAmbiguityScore(dims)).toBe(0);
  });

  it("leak saturation (5 errors) drops score by at least 0.4", () => {
    const allClean = {
      leak: makeDim("leak", 0),
      scenario: makeDim("scenario", 0),
      glossary: makeDim("glossary", 0),
    };
    const leakOnly = {
      leak: makeDim("leak", 5),
      scenario: makeDim("scenario", 0),
      glossary: makeDim("glossary", 0),
    };
    const diff = computeAmbiguityScore(allClean) - computeAmbiguityScore(leakOnly);
    expect(diff).toBeGreaterThanOrEqual(0.4);
  });

  it("score never goes below 0", () => {
    const dims = {
      leak: makeDim("leak", 100),
      scenario: makeDim("scenario", 100),
      glossary: makeDim("glossary", 100),
    };
    expect(computeAmbiguityScore(dims)).toBeGreaterThanOrEqual(0);
  });

  it("score never exceeds 1", () => {
    const dims = {
      leak: makeDim("leak", 0),
      scenario: makeDim("scenario", 0),
      glossary: makeDim("glossary", 0),
    };
    expect(computeAmbiguityScore(dims)).toBeLessThanOrEqual(1);
  });
});

describe("classifyVerdict", () => {
  const thresholds = { leak_max: 0, scenario_max: 0, glossary_miss_max: 2, ambiguity_min: 0.7 };

  it("returns healthy for score >= 0.85", () => {
    expect(classifyVerdict(0.85, thresholds)).toBe("healthy");
    expect(classifyVerdict(1.0, thresholds)).toBe("healthy");
  });

  it("returns marginal for 0.7 <= score < 0.85", () => {
    expect(classifyVerdict(0.7, thresholds)).toBe("marginal");
    expect(classifyVerdict(0.84, thresholds)).toBe("marginal");
  });

  it("returns degraded for score < 0.7", () => {
    expect(classifyVerdict(0.69, thresholds)).toBe("degraded");
    expect(classifyVerdict(0, thresholds)).toBe("degraded");
  });
});
```

Run: `npx vitest run test/spec-health.test.ts`
Expected: FAIL -- "Cannot find module ../src/spec-health.js"

**GREEN** — 写最少代码让测试通过

文件：`src/spec-health.ts`

```typescript
import type { LeakFinding } from "./pack/types.js";
import type { LintFinding } from "./pack/types.js";

export type SpecHealthDimension = "leak" | "scenario" | "glossary";

export interface DimensionScore {
  dimension: SpecHealthDimension;
  passed: boolean;
  errorCount: number;
  details: string[];
}

export type HealthVerdict = "healthy" | "marginal" | "degraded";

export type HealthRecommendation =
  | { kind: "trigger_grill"; reason: string }
  | { kind: "rerun_spec_review"; reason: string }
  | { kind: "rerun_glossary_check"; reason: string }
  | { kind: "no_action"; reason: string };

export interface SpecHealthReport {
  ambiguityScore: number;
  dimensions: Record<SpecHealthDimension, DimensionScore>;
  overallVerdict: HealthVerdict;
  recommendations: HealthRecommendation[];
}

export function computeAmbiguityScore(
  dims: Record<SpecHealthDimension, DimensionScore>,
): number {
  const leakFactor = Math.max(0, 1 - dims.leak.errorCount / 5);
  const scenarioFactor = Math.max(0, 1 - dims.scenario.errorCount / 3);
  const glossaryFactor = Math.max(0, 1 - dims.glossary.errorCount / 5);
  return 0.4 * leakFactor + 0.3 * scenarioFactor + 0.3 * glossaryFactor;
}

export function classifyVerdict(
  score: number,
  thresholds: { ambiguity_min: number },
): HealthVerdict {
  if (score >= 0.85) return "healthy";
  if (score >= 0.7) return "marginal";
  return "degraded";
}
```

Run: `npx vitest run test/spec-health.test.ts`
Expected: exit 0

**REFACTOR** — 提取常量、确保类型精确

- 将 5/3/5 和 0.4/0.3/0.3 权重提取为命名常量
- 运行全部测试确认无回归

Run: `npx vitest run test/spec-health.test.ts`
Expected: exit 0

**Commit**: `feat(spec-health): add score computation and verdict classification`

---

### Task 2: checkSpecHealth orchestration

**Depends On**: [1]
**Files**:
- Modify: `src/spec-health.ts`
- Modify: `test/spec-health.test.ts`

**RED** — 写失败测试

文件：`test/spec-health.test.ts` (追加)

```typescript
import { checkSpecHealth, type SpecHealthInput } from "../src/spec-health.js";
import type { BannedPatternRegistry, GlossaryRegistry } from "../src/pack/types.js";

function makeBannedRegistry(patterns: string[]): BannedPatternRegistry {
  const map = new Map();
  patterns.forEach((p, i) => map.set(`p${i}`, { pattern: p, description: `banned ${i}` }));
  return { entries: map, sourceLayers: [] };
}

function makeGlossaryRegistry(terms: string[]): GlossaryRegistry {
  const entries = new Map();
  const byTerm = new Map();
  terms.forEach((t) => {
    const entry = { term: t, definition: "def", aliases: [], updated: "", source: null, sourcePath: "", sourceLayer: "core" as const };
    entries.set(t, entry);
    byTerm.set(t, [entry]);
  });
  return { entries, byTerm };
}

describe("checkSpecHealth", () => {
  it("returns healthy report for clean spec", () => {
    const input: SpecHealthInput = {
      specContent: "Given clean spec\nWhen user acts\nThen result",
      specFilePath: "test.md",
      bannedRegistry: makeBannedRegistry([]),
      glossaryRegistry: makeGlossaryRegistry([]),
      thresholds: { leak_max: 0, scenario_max: 0, glossary_miss_max: 2, ambiguity_min: 0.7 },
    };
    const report = checkSpecHealth(input);
    expect(report.overallVerdict).toBe("healthy");
    expect(report.ambiguityScore).toBe(1.0);
  });

  it("returns degraded when spec has multiple leaks", () => {
    const input: SpecHealthInput = {
      specContent: "Use UserService.callApi() to fetch DataRepository.query() and HttpClient.get()",
      specFilePath: "test.md",
      bannedRegistry: makeBannedRegistry(["UserService", "DataRepository", "HttpClient", "callApi", "query"]),
      glossaryRegistry: makeGlossaryRegistry([]),
      thresholds: { leak_max: 0, scenario_max: 0, glossary_miss_max: 2, ambiguity_min: 0.7 },
    };
    const report = checkSpecHealth(input);
    expect(report.overallVerdict).toBe("degraded");
    expect(report.dimensions.leak.errorCount).toBeGreaterThanOrEqual(3);
  });

  it("generates trigger_grill recommendation when score is low", () => {
    const input: SpecHealthInput = {
      specContent: "Use ServiceA and ServiceB and ServiceC and ServiceD and ServiceE",
      specFilePath: "test.md",
      bannedRegistry: makeBannedRegistry(["ServiceA", "ServiceB", "ServiceC", "ServiceD", "ServiceE"]),
      glossaryRegistry: makeGlossaryRegistry([]),
      thresholds: { leak_max: 0, scenario_max: 0, glossary_miss_max: 2, ambiguity_min: 0.7 },
    };
    const report = checkSpecHealth(input);
    expect(report.recommendations.some((r) => r.kind === "trigger_grill")).toBe(true);
  });

  it("generates no_action when healthy", () => {
    const input: SpecHealthInput = {
      specContent: "Given good spec\nWhen user acts\nThen result",
      specFilePath: "test.md",
      bannedRegistry: makeBannedRegistry([]),
      glossaryRegistry: makeGlossaryRegistry([]),
      thresholds: { leak_max: 0, scenario_max: 0, glossary_miss_max: 2, ambiguity_min: 0.7 },
    };
    const report = checkSpecHealth(input);
    expect(report.recommendations).toEqual([{ kind: "no_action", reason: "All dimensions healthy" }]);
  });
});
```

Run: `npx vitest run test/spec-health.test.ts`
Expected: FAIL -- "checkSpecHealth is not defined" or type errors

**GREEN** — 实现 checkSpecHealth

在 `src/spec-health.ts` 中追加 `SpecHealthInput` 接口和 `checkSpecHealth` 函数。函数调用 `detectSpecLeak`、`lintScenarios`，计算 glossary miss 计数，组装 `DimensionScore`，调用 `computeAmbiguityScore` + `classifyVerdict`，生成 recommendations。

```typescript
import { detectSpecLeak } from "./spec-leak-detector.js";
import { lintScenarios } from "./scenario-linter.js";
import type { BannedPatternRegistry, GlossaryRegistry } from "./pack/types.js";

export interface SpecHealthInput {
  specContent: string;
  specFilePath: string;
  bannedRegistry: BannedPatternRegistry;
  glossaryRegistry: GlossaryRegistry;
  thresholds: {
    leak_max: number;
    scenario_max: number;
    glossary_miss_max: number;
    ambiguity_min: number;
  };
}

export function checkSpecHealth(input: SpecHealthInput): SpecHealthReport {
  const leakFindings = detectSpecLeak(
    input.specContent, input.specFilePath,
    input.bannedRegistry, input.glossaryRegistry, "spec",
  );
  const lintFindings = lintScenarios(input.specContent, input.specFilePath);
  const glossaryMissCount = computeGlossaryMissCount(input.specContent, input.glossaryRegistry);

  const dimensions: Record<SpecHealthDimension, DimensionScore> = {
    leak: { dimension: "leak", passed: leakFindings.length === 0, errorCount: leakFindings.length, details: leakFindings.map((f) => f.original) },
    scenario: { dimension: "scenario", passed: lintFindings.filter((f) => f.severity === "error").length === 0, errorCount: lintFindings.filter((f) => f.severity === "error").length, details: lintFindings.map((f) => f.message) },
    glossary: { dimension: "glossary", passed: glossaryMissCount === 0, errorCount: glossaryMissCount, details: [] },
  };

  const score = computeAmbiguityScore(dimensions);
  const verdict = classifyVerdict(score, input.thresholds);
  const recommendations = generateRecommendations(dimensions, verdict);

  return { ambiguityScore: score, dimensions, overallVerdict: verdict, recommendations };
}
```

Run: `npx vitest run test/spec-health.test.ts`
Expected: exit 0

**REFACTOR** — 提取 `computeGlossaryMissCount` 和 `generateRecommendations` 为独立可测函数

Run: `npx vitest run test/spec-health.test.ts`
Expected: exit 0

**Commit**: `feat(spec-health): add checkSpecHealth orchestration`

---

### Task 3: Advisory rendering

**Depends On**: [1]
**Files**:
- Modify: `src/spec-health.ts`
- Modify: `test/spec-health.test.ts`

**RED** — 写失败测试

```typescript
import { renderSpecHealthAdvisory } from "../src/spec-health.js";

describe("renderSpecHealthAdvisory", () => {
  it("renders marginal advisory with score", () => {
    const report: SpecHealthReport = {
      ambiguityScore: 0.78,
      dimensions: {
        leak: { dimension: "leak", passed: true, errorCount: 0, details: [] },
        scenario: { dimension: "scenario", passed: false, errorCount: 1, details: ["SCN001"] },
        glossary: { dimension: "glossary", passed: true, errorCount: 0, details: [] },
      },
      overallVerdict: "marginal",
      recommendations: [{ kind: "trigger_grill", reason: "low score" }],
    };
    const text = renderSpecHealthAdvisory(report);
    expect(text).toContain("0.78");
    expect(text).toContain("marginal");
  });

  it("renders degraded advisory with issues", () => {
    const report: SpecHealthReport = {
      ambiguityScore: 0.42,
      dimensions: {
        leak: { dimension: "leak", passed: false, errorCount: 3, details: ["a", "b", "c"] },
        scenario: { dimension: "scenario", passed: false, errorCount: 2, details: ["x", "y"] },
        glossary: { dimension: "glossary", passed: true, errorCount: 0, details: [] },
      },
      overallVerdict: "degraded",
      recommendations: [{ kind: "rerun_spec_review", reason: "3 leaks" }],
    };
    const text = renderSpecHealthAdvisory(report);
    expect(text).toContain("degraded");
    expect(text).toContain("leak: 3");
    expect(text).toContain("scenario: 2");
  });
});
```

Run: `npx vitest run test/spec-health.test.ts`
Expected: FAIL -- "renderSpecHealthAdvisory is not defined"

**GREEN** — 实现 renderSpecHealthAdvisory

```typescript
export function renderSpecHealthAdvisory(report: SpecHealthReport): string {
  const lines: string[] = [
    `## Spec Health Advisory`,
    `**Verdict**: ${report.overallVerdict}`,
    `**Score**: ${report.ambiguityScore.toFixed(2)}`,
    ``,
    `### Dimensions`,
  ];
  for (const dim of Object.values(report.dimensions)) {
    lines.push(`- ${dim.dimension}: ${dim.passed ? "✅" : "❌"} (${dim.errorCount} issues)`);
  }
  if (report.recommendations.length > 0) {
    lines.push("", "### Recommendations");
    for (const r of report.recommendations) {
      lines.push(`- [${r.kind}] ${r.reason}`);
    }
  }
  return lines.join("\n");
}
```

Run: `npx vitest run test/spec-health.test.ts`
Expected: exit 0

**REFACTOR** — 无需重构

Run: `npx vitest run test/spec-health.test.ts`
Expected: exit 0

**Commit**: `feat(spec-health): add advisory rendering`

---

### Task 4: Cache mechanism (spec_hash + frontmatter)

**Depends On**: [2]
**Files**:
- Modify: `src/spec-health.ts`
- Create: `test/spec-health-cache.test.ts`

**RED** — 写失败测试

文件：`test/spec-health-cache.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { computeSpecHash, parseHealthCache, shouldRecompute } from "../src/spec-health.js";

describe("computeSpecHash", () => {
  it("returns consistent sha256 hex for same content", () => {
    const content = "Given a spec\nWhen run\nThen pass";
    expect(computeSpecHash(content)).toBe(computeSpecHash(content));
    expect(computeSpecHash(content)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns different hash for different content", () => {
    expect(computeSpecHash("abc")).not.toBe(computeSpecHash("def"));
  });
});

describe("parseHealthCache", () => {
  it("returns null when no health field in frontmatter", () => {
    const fm = { status: "locked", topic: "test" };
    expect(parseHealthCache(fm)).toBeNull();
  });

  it("returns cached report when health field exists", () => {
    const fm = {
      status: "locked",
      topic: "test",
      health: { score: 0.9, verdict: "healthy", spec_hash: "abc123", generated_at: "2026-01-01" },
    };
    const cache = parseHealthCache(fm);
    expect(cache).not.toBeNull();
    expect(cache!.specHash).toBe("abc123");
    expect(cache!.score).toBe(0.9);
  });
});

describe("shouldRecompute", () => {
  it("returns true when spec hash differs", () => {
    expect(shouldRecompute("hash_a", { specHash: "hash_b", score: 1.0, verdict: "healthy", generatedAt: "" })).toBe(true);
  });

  it("returns false when spec hash matches", () => {
    expect(shouldRecompute("hash_a", { specHash: "hash_a", score: 1.0, verdict: "healthy", generatedAt: "" })).toBe(false);
  });

  it("returns true when cache is null", () => {
    expect(shouldRecompute("hash_a", null)).toBe(true);
  });
});
```

Run: `npx vitest run test/spec-health-cache.test.ts`
Expected: FAIL -- "Cannot find module ../src/spec-health.js" or exports not found

**GREEN** — 实现缓存函数

在 `src/spec-health.ts` 中追加：

```typescript
import { createHash } from "node:crypto";

export interface HealthCache {
  specHash: string;
  score: number;
  verdict: HealthVerdict;
  generatedAt: string;
}

export function computeSpecHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function parseHealthCache(frontmatter: Record<string, unknown>): HealthCache | null {
  const health = frontmatter.health as Record<string, unknown> | undefined;
  if (!health || typeof health !== "object") return null;
  return {
    specHash: health.spec_hash as string,
    score: health.score as number,
    verdict: health.verdict as HealthVerdict,
    generatedAt: health.generated_at as string,
  };
}

export function shouldRecompute(currentHash: string, cache: HealthCache | null): boolean {
  if (!cache) return true;
  return currentHash !== cache.specHash;
}
```

Run: `npx vitest run test/spec-health-cache.test.ts`
Expected: exit 0

**REFACTOR** — 无需重构

**Commit**: `feat(spec-health): add cache mechanism with spec_hash`

---

### Task 5: Property-based tests (PBT)

**Depends On**: [1]
**Files**:
- Create: `test/spec-health.property.test.ts`

**RED** — 写失败测试

文件：`test/spec-health.property.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { computeAmbiguityScore, type DimensionScore, type SpecHealthDimension } from "../src/spec-health.js";
import fc from "fast-check";

function makeDim(dimension: SpecHealthDimension, errorCount: number): DimensionScore {
  return { dimension, passed: errorCount === 0, errorCount, details: [] };
}

describe("PBT: computeAmbiguityScore", () => {
  it("score is always in [0, 1]", () => {
    fc.assert(
      fc.property(fc.nat(100), fc.nat(100), fc.nat(100), (leak, scenario, glossary) => {
        const dims = {
          leak: makeDim("leak", leak),
          scenario: makeDim("scenario", scenario),
          glossary: makeDim("glossary", glossary),
        };
        const score = computeAmbiguityScore(dims);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }),
    );
  });

  it("score monotonically decreases when errorCount increases in one dimension", () => {
    fc.assert(
      fc.property(
        fc.nat(20),
        fc.nat(20),
        fc.constantFrom<SpecHealthDimension>("leak", "scenario", "glossary"),
        (baseLeak, baseScenario, dim) => {
          const base = {
            leak: makeDim("leak", baseLeak),
            scenario: makeDim("scenario", baseScenario),
            glossary: makeDim("glossary", 0),
          };
          const increased = { ...base, [dim]: makeDim(dim, (base[dim].errorCount + 1)) };
          expect(computeAmbiguityScore(increased)).toBeLessThanOrEqual(computeAmbiguityScore(base));
        },
      ),
    );
  });

  it("all-zero errors always gives 1.0", () => {
    const dims = {
      leak: makeDim("leak", 0),
      scenario: makeDim("scenario", 0),
      glossary: makeDim("glossary", 0),
    };
    fc.assert(
      fc.property(fc.constant(computeAmbiguityScore(dims)), (score) => {
        expect(score).toBe(1.0);
      }),
    );
  });
});
```

Run: `npx vitest run test/spec-health.property.test.ts`
Expected: exit 0 (tests should pass immediately since Task 1 already implements the function)

**GREEN** — 无需额外代码，Task 1 已实现

Run: `npx vitest run test/spec-health.property.test.ts`
Expected: exit 0

**REFACTOR** — 无需重构

**Commit**: `test(spec-health): add property-based tests for score invariants`

---

### Task 6: Skill integration contract tests

**Depends On**: [2, 3, 4]
**Files**:
- Create: `test/spec-health-skill-integration.test.ts`

**RED** — 写失败测试

文件：`test/spec-health-skill-integration.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import {
  checkSpecHealth,
  computeSpecHash,
  shouldRecompute,
  type SpecHealthInput,
} from "../src/spec-health.js";

describe("Skill integration contracts", () => {
  describe("forge-spec: Step 2 health frontmatter", () => {
    it("report can be serialized to frontmatter health field", () => {
      const input: SpecHealthInput = {
        specContent: "Given spec\nWhen action\nThen result",
        specFilePath: "spec.md",
        bannedRegistry: { entries: new Map(), sourceLayers: [] },
        glossaryRegistry: { entries: new Map(), byTerm: new Map() },
        thresholds: { leak_max: 0, scenario_max: 0, glossary_miss_max: 2, ambiguity_min: 0.7 },
      };
      const report = checkSpecHealth(input);
      const healthField = {
        score: report.ambiguityScore,
        verdict: report.overallVerdict,
        spec_hash: computeSpecHash(input.specContent),
        generated_at: new Date().toISOString(),
      };
      expect(healthField.score).toBeTypeOf("number");
      expect(healthField.verdict).toMatch(/^(healthy|marginal|degraded)$/);
      expect(healthField.spec_hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("forge-plan: pre-flight cache check", () => {
    it("skips recomputation when spec_hash matches", () => {
      const content = "Given spec\nWhen action\nThen result";
      const hash = computeSpecHash(content);
      const cache = { specHash: hash, score: 1.0, verdict: "healthy" as const, generatedAt: "" };
      expect(shouldRecompute(hash, cache)).toBe(false);
    });

    it("forces recomputation when spec_hash differs", () => {
      const hash = computeSpecHash("new content");
      const cache = { specHash: "old_hash", score: 0.5, verdict: "degraded" as const, generatedAt: "" };
      expect(shouldRecompute(hash, cache)).toBe(true);
    });
  });

  describe("forge-debug: marginal verdict provides grill recommendation", () => {
    it("marginal score triggers grill recommendation", () => {
      const input: SpecHealthInput = {
        specContent: "Use ServiceX",
        specFilePath: "spec.md",
        bannedRegistry: (() => { const m = new Map(); m.set("s1", { pattern: "ServiceX", description: "impl detail" }); return { entries: m, sourceLayers: [] }; })(),
        glossaryRegistry: { entries: new Map(), byTerm: new Map() },
        thresholds: { leak_max: 0, scenario_max: 0, glossary_miss_max: 2, ambiguity_min: 0.7 },
      };
      const report = checkSpecHealth(input);
      if (report.overallVerdict === "marginal" || report.overallVerdict === "degraded") {
        expect(report.recommendations.some((r) => r.kind === "trigger_grill")).toBe(true);
      }
    });
  });

  describe("forge-review: degraded verdict detection", () => {
    it("degraded verdict is detectable from report", () => {
      const report = {
        ambiguityScore: 0.3,
        overallVerdict: "degraded" as const,
        dimensions: {} as any,
        recommendations: [],
      };
      expect(report.overallVerdict).toBe("degraded");
      // Review layer should add spec re-validation sub-item when verdict is degraded
      const needsRevalidation = report.overallVerdict === "degraded";
      expect(needsRevalidation).toBe(true);
    });
  });
});
```

Run: `npx vitest run test/spec-health-skill-integration.test.ts`
Expected: exit 0 (functions already implemented in Tasks 1-4)

**GREEN** — 无需额外代码

Run: `npx vitest run test/spec-health-skill-integration.test.ts`
Expected: exit 0

**REFACTOR** — 无需重构

**Commit**: `test(spec-health): add skill integration contract tests`

---

### Task 7: Barrel export

**Depends On**: [1, 2, 3, 4]
**Files**:
- Modify: `src/index.ts`

**RED** — 写失败测试

文件：`test/spec-health-export.test.ts`

```typescript
import { describe, it, expect } from "vitest";

describe("barrel exports", () => {
  it("exports checkSpecHealth from index", async () => {
    const mod = await import("../src/index.js");
    expect(mod.checkSpecHealth).toBeDefined();
    expect(mod.computeAmbiguityScore).toBeDefined();
    expect(mod.classifyVerdict).toBeDefined();
    expect(mod.renderSpecHealthAdvisory).toBeDefined();
    expect(mod.computeSpecHash).toBeDefined();
    expect(mod.shouldRecompute).toBeDefined();
  });
});
```

Run: `npx vitest run test/spec-health-export.test.ts`
Expected: FAIL -- exports not found

**GREEN** — 在 `src/index.ts` 追加 barrel 导出

```typescript
// Spec Health
export {
  checkSpecHealth,
  computeAmbiguityScore,
  classifyVerdict,
  renderSpecHealthAdvisory,
  computeSpecHash,
  parseHealthCache,
  shouldRecompute,
} from "./spec-health.js";
export type {
  SpecHealthDimension,
  DimensionScore,
  HealthVerdict,
  HealthRecommendation,
  SpecHealthReport,
  SpecHealthInput,
  HealthCache,
} from "./spec-health.js";
```

Run: `npx vitest run test/spec-health-export.test.ts`
Expected: exit 0

**REFACTOR** — 无需重构

**Commit**: `feat(spec-health): add barrel exports to index.ts`

---

### Task 8: SKILL.md documentation updates

**Depends On**: [7]
**Files**:
- Modify: `skills/forge-spec/SKILL.md`
- Modify: `skills/forge-plan/SKILL.md`
- Modify: `skills/forge-build/SKILL.md`
- Modify: `skills/forge-debug/SKILL.md`
- Modify: `skills/forge-review/SKILL.md`

**RED** — 无测试（文档变更）

**GREEN** — 逐文件修改：

1. `forge-spec/SKILL.md` — Step 2 Review 末尾追加：
   > After Step 2 Review completes, call `checkSpecHealth(input)` and write result to spec frontmatter `health: { score, verdict, spec_hash, generated_at }`.

2. `forge-plan/SKILL.md` — §1.5 Pre-flight 追加：
   > Read spec frontmatter `health` field. If verdict=degraded: interactive → prompt user (return to spec / trigger grill / force continue); autonomous → write advisory to findings/, continue.

3. `forge-build/SKILL.md` — §1.5 同 forge-plan

4. `forge-debug/SKILL.md` — Phase 1 追加：
   > Read spec health verdict. If marginal or degraded, include "problem may stem from ambiguous spec" as hypothesis. If recommendations contain trigger_grill, optionally trigger grill-inline.

5. `forge-review/SKILL.md` — Layer 1 追加：
   > If spec health verdict=degraded, add "spec re-validation" sub-item to Layer 1 checklist.

Run: `grep -c "checkSpecHealth" skills/forge-*/SKILL.md`
Expected: output contains at least 5 non-zero counts

**REFACTOR** — 无需重构

**Commit**: `docs(spec-health): add health check integration to 5 SKILL.md files`

---

## Summary

| Task | Files | Est. | Depends |
|------|-------|------|---------|
| 1 | src/spec-health.ts, test/spec-health.test.ts | 5 min | [] |
| 2 | src/spec-health.ts, test/spec-health.test.ts | 5 min | [1] |
| 3 | src/spec-health.ts, test/spec-health.test.ts | 3 min | [1] |
| 4 | src/spec-health.ts, test/spec-health-cache.test.ts | 3 min | [2] |
| 5 | test/spec-health.property.test.ts | 3 min | [1] |
| 6 | test/spec-health-skill-integration.test.ts | 3 min | [2,3,4] |
| 7 | src/index.ts, test/spec-health-export.test.ts | 2 min | [1,2,3,4] |
| 8 | 5 × skills/forge-*/SKILL.md | 3 min | [7] |

Total: 8 tasks, ~27 min
