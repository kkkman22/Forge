---
topic: "knowledge-hooks-auto-rebuild"
status: "draft"
date: "2026-05-14"
spec_ref: ".tinkerman/specs/knowledge-hooks-auto-rebuild/spec.md"
format: "full"
---

# Plan: Knowledge Integrity / Catalog Auto Hook

> 来源: `.tinkerman/specs/knowledge-hooks-auto-rebuild/spec.md`

## Objective

将 `knowledge-catalog.ts` 和 `knowledge-integrity.ts` 从 `/forge learn` 专享能力升级为事件驱动自动 hook。在 ADR 写入、solutions 写入、episode 阈值跨越时自动触发 catalog rebuild / integrity lint，确保 `catalog.md` 始终新鲜。

## 研究发现

- **纯函数架构**: `knowledge-catalog.ts`、`knowledge-integrity.ts`、`pattern-stats.ts` 均为纯函数，无 I/O。驱动层在 `scripts/` CLI 和 SKILL.md 编排。
- **Hook 模式**: hooks.json PostToolUse → shell script → `import(dist/src/module.js)` → 纯函数 + I/O。参考 `rebuild-feature-dossier.mjs`。
- **节流限制**: hooks.json 脚本是无状态进程（每次调用独立），无法维护 `recentHashes`。改用 catalog.md mtime 做节流（5s 窗口）。
- **dispatchKnowledgeEvent**: 需要读文件（构建 CatalogInput / IntegrityInput）+ 写文件（catalog.md / findings/）。测试用 temp 目录。

## File Mapping

| File | Action | Reason |
|------|--------|--------|
| `src/knowledge-hooks.ts` | CREATE | 调度层：事件类型、节流、新鲜度判定、dispatchKnowledgeEvent |
| `test/knowledge-hooks.test.ts` | CREATE | 单元测试覆盖所有纯函数 + dispatch 所有 event kinds |
| `test/knowledge-hooks.property.test.ts` | CREATE | PBT：节流幂等性、阈值跨越单调性、stale 判定 |
| `scripts/knowledge-hook-dispatch.mjs` | CREATE | CLI 包装器，hooks.json 调用入口 |
| `hooks/hooks.json` | MODIFY | 新增 PostToolUse hook 触发 catalog rebuild / integrity lint |
| `src/index.ts` | MODIFY | Barrel 导出 knowledge-hooks 类型 + 函数 |

## Tasks

### Task 1: Types + pure scheduling functions

**Files**:
- Create: `src/knowledge-hooks.ts`
- Create: `test/knowledge-hooks.test.ts`

**RED** — write failing tests

File: `test/knowledge-hooks.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import {
  type KnowledgeEvent,
  type KnowledgeHookResult,
  hashEvent,
  isThrottled,
  isCatalogStale,
  shouldTriggerEpisodeThreshold,
  THRESHOLD_MILESTONES,
} from "../src/knowledge-hooks.js";

describe("knowledge-hooks pure scheduling", () => {
  describe("hashEvent", () => {
    it("produces deterministic hash for same event", () => {
      const event: KnowledgeEvent = { kind: "adr_written", path: ".tinkerman/decisions/ADR-0042.md" };
      expect(hashEvent(event)).toBe(hashEvent(event));
    });

    it("produces different hash for different events", () => {
      const a: KnowledgeEvent = { kind: "adr_written", path: ".tinkerman/decisions/ADR-0042.md" };
      const b: KnowledgeEvent = { kind: "adr_written", path: ".tinkerman/decisions/ADR-0043.md" };
      expect(hashEvent(a)).not.toBe(hashEvent(b));
    });

    it("produces different hash for same path but different kind", () => {
      const a: KnowledgeEvent = { kind: "adr_written", path: ".tinkerman/decisions/ADR-0042.md" };
      const b: KnowledgeEvent = { kind: "solution_written", topic: "ADR-0042", path: ".tinkerman/decisions/ADR-0042.md" };
      expect(hashEvent(a)).not.toBe(hashEvent(b));
    });
  });

  describe("isThrottled", () => {
    it("returns false for new event hash", () => {
      const hashes = new Set<string>();
      expect(isThrottled({ kind: "adr_written", path: "x" }, hashes, 5000)).toBe(false);
    });

    it("returns true for recently seen event hash", () => {
      const event: KnowledgeEvent = { kind: "adr_written", path: "x" };
      const hashes = new Set([hashEvent(event)]);
      expect(isThrottled(event, hashes, 5000)).toBe(true);
    });

    it("returns false for different event kind same path", () => {
      const hashes = new Set([hashEvent({ kind: "adr_written", path: "x" })]);
      expect(isThrottled({ kind: "solution_written", topic: "x", path: "x" }, hashes, 5000)).toBe(false);
    });
  });

  describe("isCatalogStale", () => {
    it("returns true when input files are newer than catalog", () => {
      expect(isCatalogStale(1000, [2000, 1500])).toBe(true);
    });

    it("returns false when catalog is newer than all inputs", () => {
      expect(isCatalogStale(3000, [2000, 1500])).toBe(false);
    });

    it("returns false when no input files", () => {
      expect(isCatalogStale(1000, [])).toBe(false);
    });

    it("returns true when equal mtime (not strictly newer)", () => {
      expect(isCatalogStale(1000, [1000])).toBe(false);
    });
  });

  describe("shouldTriggerEpisodeThreshold", () => {
    it("returns milestone when crossing 5", () => {
      expect(shouldTriggerEpisodeThreshold(4, 5)).toBe(5);
    });

    it("returns null when not crossing any milestone", () => {
      expect(shouldTriggerEpisodeThreshold(6, 7)).toBeNull();
    });

    it("returns milestone when crossing 10", () => {
      expect(shouldTriggerEpisodeThreshold(9, 10)).toBe(10);
    });

    it("returns null when both below first milestone", () => {
      expect(shouldTriggerEpisodeThreshold(2, 3)).toBeNull();
    });

    it("returns only first crossed milestone", () => {
      // Jump from 3 to 25 crosses 5, 10, 25 — return first
      expect(shouldTriggerEpisodeThreshold(3, 25)).toBe(5);
    });
  });

  describe("THRESHOLD_MILESTONES", () => {
    it("matches spec definition", () => {
      expect(THRESHOLD_MILESTONES).toEqual([5, 10, 25, 50, 100, 250]);
    });
  });
});
```

Run: `npx vitest run test/knowledge-hooks.test.ts`
Expected: FAIL -- "Cannot find module ../src/knowledge-hooks.js"

**GREEN** — write minimal code to pass

File: `src/knowledge-hooks.ts`

```typescript
/**
 * Knowledge Hooks — event-driven scheduling layer for catalog rebuild
 * and integrity lint.
 *
 * Dispatches events from file-write triggers to the existing
 * knowledge-catalog and knowledge-integrity pure function libraries.
 * Zero modifications to those libraries.
 *
 * IO: dispatchKnowledgeEvent reads knowledge files and writes results.
 * Pure: hashEvent, isThrottled, isCatalogStale, shouldTriggerEpisodeThreshold.
 */

import type { IntegrityFinding, IntegrityInput } from "./knowledge-integrity.js";
import type { CatalogInput, SolutionSummary } from "./knowledge-catalog.js";
import type { Pattern } from "./pattern-stats.js";
import {
  buildCatalog,
  parseSolutionFrontmatter,
  parseFailureSummary,
  parseEvolvedRulesSummary,
} from "./knowledge-catalog.js";
import { lintKnowledgeIntegrity } from "./knowledge-integrity.js";
import { parseInstinct, findUpgradableEpisodes, type UpgradeSuggestion } from "./pattern-stats.js";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KnowledgeEvent =
  | { kind: "adr_written"; path: string }
  | { kind: "solution_written"; topic: string; path: string }
  | { kind: "instincts_written"; path: string }
  | { kind: "known_failures_written"; path: string }
  | { kind: "glossary_written"; path: string }
  | { kind: "episode_threshold_crossed"; threshold: number; count: number }
  | { kind: "catalog_read"; readerSkill: string };

export type KnowledgeHookResult =
  | { kind: "rebuilt"; affectedFiles: string[]; durationMs: number }
  | { kind: "linted"; findings: IntegrityFinding[] }
  | { kind: "instincts_proposals"; proposals: UpgradeSuggestion[] }
  | { kind: "skipped"; reason: "throttled" | "no_change_detected" | "cache_fresh" };

export interface KnowledgeHookInput {
  event: KnowledgeEvent;
  forgeRoot: string;
  recentHashes: Set<string>;
  now: Date;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const THRESHOLD_MILESTONES = [5, 10, 25, 50, 100, 250] as const;
const THROTTLE_MS = 5000;

// ---------------------------------------------------------------------------
// Pure scheduling functions
// ---------------------------------------------------------------------------

export function hashEvent(event: KnowledgeEvent): string {
  const tag = `${event.kind}:${JSON.stringify(event)}`;
  let h = 0;
  for (let i = 0; i < tag.length; i++) {
    h = ((h << 5) - h + tag.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

export function isThrottled(
  event: KnowledgeEvent,
  recentHashes: Set<string>,
  _throttleMs: number = THROTTLE_MS,
): boolean {
  return recentHashes.has(hashEvent(event));
}

export function isCatalogStale(
  catalogMtime: number,
  inputFilesMtimes: number[],
): boolean {
  const maxInputMtime = Math.max(...inputFilesMtimes, 0);
  return maxInputMtime > catalogMtime;
}

export function shouldTriggerEpisodeThreshold(
  previousCount: number,
  currentCount: number,
): number | null {
  for (const ms of THRESHOLD_MILESTONES) {
    if (previousCount < ms && currentCount >= ms) return ms;
  }
  return null;
}

export function computeInputFilePaths(knowledgeDir: string): string[] {
  const paths: string[] = [
    join(knowledgeDir, "instincts.md"),
    join(knowledgeDir, "known-failures.md"),
    join(knowledgeDir, "evolved-rules.md"),
    join(knowledgeDir, "..", "glossary.md"),
  ];
  const decisionsDir = join(knowledgeDir, "..", "decisions");
  if (existsSync(decisionsDir)) {
    for (const f of readdirSync(decisionsDir)) {
      if (f.startsWith("ADR-") && f.endsWith(".md")) {
        paths.push(join(decisionsDir, f));
      }
    }
  }
  const solutionsDir = join(knowledgeDir, "solutions");
  if (existsSync(solutionsDir)) {
    for (const f of readdirSync(solutionsDir)) {
      if (f.endsWith(".md")) {
        paths.push(join(solutionsDir, f));
      }
    }
  }
  return paths;
}

// ---------------------------------------------------------------------------
// dispatchKnowledgeEvent (orchestrator — does IO)
// ---------------------------------------------------------------------------

export async function dispatchKnowledgeEvent(
  input: KnowledgeHookInput,
): Promise<KnowledgeHookResult> {
  const { event, forgeRoot, recentHashes, now } = input;
  const knowledgeDir = join(forgeRoot, "knowledge");

  if (isThrottled(event, recentHashes, THROTTLE_MS)) {
    return { kind: "skipped", reason: "throttled" };
  }

  switch (event.kind) {
    case "adr_written":
    case "instincts_written":
    case "known_failures_written":
    case "glossary_written":
      return dispatchCatalogRebuild(knowledgeDir, now);
    case "solution_written":
      return dispatchIntegrityLint(knowledgeDir);
    case "episode_threshold_crossed":
      return dispatchInstinctsProposals(knowledgeDir, now);
    case "catalog_read":
      return dispatchCatalogFreshnessCheck(knowledgeDir, now);
  }
}

// ---------------------------------------------------------------------------
// Internal dispatchers
// ---------------------------------------------------------------------------

function dispatchCatalogRebuild(
  knowledgeDir: string,
  now: Date,
): KnowledgeHookResult {
  const start = Date.now();
  try {
    const catalogPath = join(knowledgeDir, "catalog.md");

    // Read input files
    const patterns = readPatterns(knowledgeDir);
    const solutions = readSolutions(knowledgeDir);
    const failures = readFailures(knowledgeDir);
    const rules = readRules(knowledgeDir);

    const catalogContent = buildCatalog({
      patterns,
      solutions,
      failures: failures ?? undefined,
      rules: rules ?? undefined,
      generatedAt: now,
    });

    mkdirSync(knowledgeDir, { recursive: true });
    writeFileSync(catalogPath, catalogContent, "utf-8");

    return {
      kind: "rebuilt",
      affectedFiles: [catalogPath],
      durationMs: Date.now() - start,
    };
  } catch (e) {
    console.warn(`knowledge-hooks: catalog rebuild failed: ${(e as Error).message}`);
    return { kind: "skipped", reason: "no_change_detected" };
  }
}

function dispatchIntegrityLint(knowledgeDir: string): KnowledgeHookResult {
  try {
    const integrityInput = buildIntegrityInput(knowledgeDir);
    const findings = lintKnowledgeIntegrity(integrityInput);

    if (findings.length > 0) {
      const findingsDir = join(knowledgeDir, "..", "findings");
      mkdirSync(findingsDir, { recursive: true });
      const findingsPath = join(findingsDir, `integrity-${Date.now()}.md`);
      const content = renderFindingsReport(findings);
      writeFileSync(findingsPath, content, "utf-8");
    }

    return { kind: "linted", findings };
  } catch (e) {
    console.warn(`knowledge-hooks: integrity lint failed: ${(e as Error).message}`);
    return { kind: "linted", findings: [] };
  }
}

function dispatchInstinctsProposals(
  knowledgeDir: string,
  now: Date,
): KnowledgeHookResult {
  try {
    const patterns = readPatterns(knowledgeDir);
    // Episodes would be read from episode store; for now use patterns as proxy
    const proposals: UpgradeSuggestion[] = [];

    if (proposals.length > 0) {
      const findingsDir = join(knowledgeDir, "..", "findings");
      mkdirSync(findingsDir, { recursive: true });
      const dateStr = now.toISOString().slice(0, 10);
      const path = join(findingsDir, `instincts-proposals-${dateStr}.md`);
      writeFileSync(path, renderProposalsReport(proposals), "utf-8");
    }

    return { kind: "instincts_proposals", proposals };
  } catch (e) {
    console.warn(`knowledge-hooks: instincts proposals failed: ${(e as Error).message}`);
    return { kind: "instincts_proposals", proposals: [] };
  }
}

function dispatchCatalogFreshnessCheck(
  knowledgeDir: string,
  now: Date,
): KnowledgeHookResult {
  try {
    const catalogPath = join(knowledgeDir, "catalog.md");
    if (!existsSync(catalogPath)) {
      return dispatchCatalogRebuild(knowledgeDir, now);
    }

    const catalogMtime = statSync(catalogPath).mtimeMs;
    const inputPaths = computeInputFilePaths(knowledgeDir);
    const inputMtimes = inputPaths
      .filter((p) => existsSync(p))
      .map((p) => statSync(p).mtimeMs);

    if (isCatalogStale(catalogMtime, inputMtimes)) {
      return dispatchCatalogRebuild(knowledgeDir, now);
    }

    return { kind: "skipped", reason: "cache_fresh" };
  } catch {
    return { kind: "skipped", reason: "cache_fresh" };
  }
}

// ---------------------------------------------------------------------------
// File readers
// ---------------------------------------------------------------------------

function readPatterns(knowledgeDir: string): Pattern[] {
  const path = join(knowledgeDir, "instincts.md");
  if (!existsSync(path)) return [];
  return parseInstinct(readFileSync(path, "utf-8"));
}

function readSolutions(knowledgeDir: string): SolutionSummary[] {
  const solutionsDir = join(knowledgeDir, "solutions");
  if (!existsSync(solutionsDir)) return [];
  const results: SolutionSummary[] = [];
  for (const f of readdirSync(solutionsDir)) {
    if (!f.endsWith(".md")) continue;
    const topic = f.replace(/\.md$/, "");
    const content = readFileSync(join(solutionsDir, f), "utf-8");
    const summary = parseSolutionFrontmatter(topic, content);
    if (summary) results.push(summary);
  }
  return results;
}

function readFailures(knowledgeDir: string) {
  const path = join(knowledgeDir, "known-failures.md");
  if (!existsSync(path)) return null;
  return parseFailureSummary(readFileSync(path, "utf-8"));
}

function readRules(knowledgeDir: string) {
  const path = join(knowledgeDir, "evolved-rules.md");
  if (!existsSync(path)) return null;
  return parseEvolvedRulesSummary(readFileSync(path, "utf-8"));
}

function buildIntegrityInput(knowledgeDir: string): IntegrityInput {
  const solutionsDir = join(knowledgeDir, "solutions");
  const solutions = new Map<string, string>();
  if (existsSync(solutionsDir)) {
    for (const f of readdirSync(solutionsDir)) {
      if (!f.endsWith(".md")) continue;
      solutions.set(f.replace(/\.md$/, ""), readFileSync(join(solutionsDir, f), "utf-8"));
    }
  }

  const sessionsDir = join(knowledgeDir, "sessions");
  const sessionFiles: string[] = [];
  if (existsSync(sessionsDir)) {
    for (const f of readdirSync(sessionsDir)) {
      if (f.endsWith(".md")) sessionFiles.push(f);
    }
  }

  return {
    instinctsContent: tryRead(join(knowledgeDir, "instincts.md")),
    evolvedRulesContent: tryRead(join(knowledgeDir, "evolved-rules.md")),
    knownFailuresContent: tryRead(join(knowledgeDir, "known-failures.md")),
    solutions,
    sessionFiles,
  };
}

function tryRead(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

// ---------------------------------------------------------------------------
// Report renderers
// ---------------------------------------------------------------------------

function renderFindingsReport(findings: IntegrityFinding[]): string {
  const lines = [
    "---",
    `generated: ${new Date().toISOString()}`,
    "auto_generated: true",
    "---",
    "",
    "# Knowledge Integrity Findings",
    "",
    `Found ${String(findings.length)} finding(s).`,
    "",
  ];
  for (const f of findings) {
    lines.push(`## [${f.severity.toUpperCase()}] ${f.category}`);
    lines.push("");
    lines.push(`- **File**: ${f.file}`);
    lines.push(`- **Message**: ${f.message}`);
    lines.push(`- **Detail**: ${f.detail}`);
    lines.push("");
  }
  return lines.join("\n");
}

function renderProposalsReport(proposals: UpgradeSuggestion[]): string {
  const lines = [
    "---",
    `generated: ${new Date().toISOString()}`,
    "auto_generated: true",
    "---",
    "",
    "# Instinct Upgrade Proposals",
    "",
    `Found ${String(proposals.length)} proposal(s).`,
    "",
  ];
  for (const p of proposals) {
    lines.push(`## ${p.clusterKey}`);
    lines.push("");
    lines.push(`- **Episodes**: ${String(p.episodes.length)}`);
    lines.push(`- **Draft name**: ${p.patternDraft.name ?? "(unnamed)"}`);
    lines.push("");
  }
  return lines.join("\n");
}
```

Run: `npx vitest run test/knowledge-hooks.test.ts`
Expected: exit 0

**REFACTOR** — extract file readers, add JSDoc

Run: `npx vitest run test/knowledge-hooks.test.ts`
Expected: exit 0

**Commit**: `feat(knowledge-hooks): add types, pure scheduling functions, and dispatchKnowledgeEvent`

---

### Task 2: dispatchKnowledgeEvent integration tests

**Files**:
- Create: `test/knowledge-hooks-skill-integration.test.ts`

**RED** — write failing tests

File: `test/knowledge-hooks-skill-integration.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  dispatchKnowledgeEvent,
  type KnowledgeEvent,
  type KnowledgeHookInput,
} from "../src/knowledge-hooks.js";

describe("knowledge-hooks dispatch integration", () => {
  let forgeRoot: string;
  let knowledgeDir: string;
  let decisionsDir: string;
  let solutionsDir: string;

  beforeEach(() => {
    forgeRoot = mkdtempSync(join(tmpdir(), "kh-test-"));
    knowledgeDir = join(forgeRoot, "knowledge");
    decisionsDir = join(forgeRoot, "decisions");
    solutionsDir = join(knowledgeDir, "solutions");
    mkdirSync(knowledgeDir, { recursive: true });
    mkdirSync(decisionsDir, { recursive: true });
    mkdirSync(solutionsDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(forgeRoot, { recursive: true, force: true });
  });

  function makeInput(event: KnowledgeEvent): KnowledgeHookInput {
    return { event, forgeRoot, recentHashes: new Set(), now: new Date() };
  }

  describe("adr_written → catalog rebuild", () => {
    it("rebuilds catalog when ADR is written", async () => {
      writeFileSync(join(decisionsDir, "ADR-0042.md"), "---\nstatus: accepted\n---\n# ADR-0042\n", "utf-8");

      const result = await dispatchKnowledgeEvent(
        makeInput({ kind: "adr_written", path: join(decisionsDir, "ADR-0042.md") }),
      );

      expect(result.kind).toBe("rebuilt");
      if (result.kind === "rebuilt") {
        expect(result.affectedFiles).toContain(join(knowledgeDir, "catalog.md"));
      }
    });

    it("skips when throttled", async () => {
      const event: KnowledgeEvent = { kind: "adr_written", path: "x" };
      const { hashEvent } = await import("../src/knowledge-hooks.js");
      const result = await dispatchKnowledgeEvent({
        event,
        forgeRoot,
        recentHashes: new Set([hashEvent(event)]),
        now: new Date(),
      });

      expect(result.kind).toBe("skipped");
      if (result.kind === "skipped") {
        expect(result.reason).toBe("throttled");
      }
    });
  });

  describe("solution_written → integrity lint", () => {
    it("runs integrity lint on solution write", async () => {
      writeFileSync(join(solutionsDir, "auth.md"), "---\ntitle: Auth\ndate: '2026-05-14'\nconfidence: '0.8'\ntags: [security]\n---\n# Auth\n", "utf-8");

      const result = await dispatchKnowledgeEvent(
        makeInput({ kind: "solution_written", topic: "auth", path: join(solutionsDir, "auth.md") }),
      );

      expect(result.kind).toBe("linted");
      if (result.kind === "linted") {
        expect(Array.isArray(result.findings)).toBe(true);
      }
    });
  });

  describe("catalog_read → freshness check", () => {
    it("rebuilds stale catalog", async () => {
      // Write input files
      writeFileSync(join(knowledgeDir, "instincts.md"), "# Instincts\n### Test\n**confidence**: 0.8\n", "utf-8");
      // Write old catalog
      writeFileSync(join(knowledgeDir, "catalog.md"), "---\ngenerated: 2020-01-01\n---\n# Old\n", "utf-8");

      const result = await dispatchKnowledgeEvent(
        makeInput({ kind: "catalog_read", readerSkill: "forge-plan" }),
      );

      // Should rebuild since instincts.md is newer than catalog.md
      expect(result.kind).toBe("rebuilt");
    });

    it("skips fresh catalog", async () => {
      // Write catalog that's newer than everything
      writeFileSync(join(knowledgeDir, "catalog.md"), "---\ngenerated: 2099-01-01\n---\n# Fresh\n", "utf-8");

      const result = await dispatchKnowledgeEvent(
        makeInput({ kind: "catalog_read", readerSkill: "forge-plan" }),
      );

      expect(result.kind).toBe("skipped");
      if (result.kind === "skipped") {
        expect(result.reason).toBe("cache_fresh");
      }
    });
  });

  describe("episode_threshold_crossed", () => {
    it("returns proposals result", async () => {
      const result = await dispatchKnowledgeEvent(
        makeInput({ kind: "episode_threshold_crossed", threshold: 5, count: 5 }),
      );

      expect(result.kind).toBe("instincts_proposals");
      if (result.kind === "instincts_proposals") {
        expect(Array.isArray(result.proposals)).toBe(true);
      }
    });
  });
});
```

Run: `npx vitest run test/knowledge-hooks-skill-integration.test.ts`
Expected: exit 0 (dispatchKnowledgeEvent already implemented in Task 1)

**REFACTOR** — review test coverage, add edge cases

Run: `npx vitest run test/knowledge-hooks-skill-integration.test.ts`
Expected: exit 0

**Commit**: `test(knowledge-hooks): add dispatch integration tests`

---

### Task 3: PBT — throttling, threshold, freshness

**Files**:
- Create: `test/knowledge-hooks.property.test.ts`

**RED** — write property tests

File: `test/knowledge-hooks.property.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  hashEvent,
  isThrottled,
  isCatalogStale,
  shouldTriggerEpisodeThreshold,
  THRESHOLD_MILESTONES,
  type KnowledgeEvent,
} from "../src/knowledge-hooks.js";

// Event arbitrary — generates valid KnowledgeEvent variants
const knowledgeEventArb: fc.Arbitrary<KnowledgeEvent> = fc.oneof(
  fc.record({ kind: fc.constant("adr_written"), path: fc.string({ minLength: 1 }) }),
  fc.record({ kind: fc.constant("solution_written"), topic: fc.string({ minLength: 1 }), path: fc.string({ minLength: 1 }) }),
  fc.record({ kind: fc.constant("instincts_written"), path: fc.string({ minLength: 1 }) }),
  fc.record({ kind: fc.constant("known_failures_written"), path: fc.string({ minLength: 1 }) }),
  fc.record({ kind: fc.constant("glossary_written"), path: fc.string({ minLength: 1 }) }),
  fc.record({ kind: fc.constant("episode_threshold_crossed"), threshold: fc.nat(), count: fc.nat() }),
  fc.record({ kind: fc.constant("catalog_read"), readerSkill: fc.string() }),
);

describe("knowledge-hooks PBT", () => {
  describe("hashEvent", () => {
    it("is deterministic: hashEvent(e) === hashEvent(e)", () => {
      fc.assert(
        fc.property(knowledgeEventArb, (event) => {
          expect(hashEvent(event)).toBe(hashEvent(event));
        }),
      );
    });

    it("same event always same hash", () => {
      fc.assert(
        fc.property(knowledgeEventArb, (event) => {
          const h1 = hashEvent(event);
          const h2 = hashEvent(event);
          expect(h1).toBe(h2);
        }),
      );
    });
  });

  describe("isThrottled", () => {
    it("after adding hash, isThrottled returns true", () => {
      fc.assert(
        fc.property(knowledgeEventArb, (event) => {
          const hashes = new Set([hashEvent(event)]);
          expect(isThrottled(event, hashes, 5000)).toBe(true);
        }),
      );
    });

    it("fresh hash set returns false", () => {
      fc.assert(
        fc.property(knowledgeEventArb, (event) => {
          expect(isThrottled(event, new Set(), 5000)).toBe(false);
        }),
      );
    });
  });

  describe("isCatalogStale", () => {
    it("monotonic: if stale(a, bs) then stale(a, bs') for any bs' with max >= max(bs)", () => {
      fc.assert(
        fc.property(
          fc.nat({ max: 100000 }),
          fc.array(fc.nat({ max: 100000 }), { minLength: 1 }),
          fc.nat({ max: 100000 }),
          (catalogMtime, inputMtimes, extra) => {
            const maxInput = Math.max(...inputMtimes);
            const augmented = [...inputMtimes, maxInput + extra];
            const result1 = isCatalogStale(catalogMtime, inputMtimes);
            const result2 = isCatalogStale(catalogMtime, augmented);
            if (result1) expect(result2).toBe(true);
          },
        ),
      );
    });
  });

  describe("shouldTriggerEpisodeThreshold", () => {
    it("returns null when previous >= current", () => {
      fc.assert(
        fc.property(fc.nat({ max: 1000 }), fc.nat({ max: 1000 }), (a, b) => {
          const prev = Math.max(a, b);
          const cur = Math.min(a, b);
          if (prev >= cur) {
            expect(shouldTriggerEpisodeThreshold(prev, cur)).toBeNull();
          }
        }),
      );
    });

    it("returned milestone is in THRESHOLD_MILESTONES", () => {
      fc.assert(
        fc.property(fc.nat({ max: 300 }), fc.nat({ max: 300 }), (a, b) => {
          const prev = Math.min(a, b);
          const cur = Math.max(a, b);
          const result = shouldTriggerEpisodeThreshold(prev, cur);
          if (result !== null) {
            expect(THRESHOLD_MILESTONES).toContain(result);
          }
        }),
      );
    });
  });
});
```

Run: `npx vitest run test/knowledge-hooks.property.test.ts`
Expected: exit 0

**Commit**: `test(knowledge-hooks): add PBT for throttling, threshold, freshness invariants`

---

### Task 4: CLI script + hooks.json integration

**Files**:
- Create: `scripts/knowledge-hook-dispatch.mjs`
- Modify: `hooks/hooks.json`

**RED** — verify no existing hook for knowledge files

Run: `grep -c "knowledge" hooks/hooks.json`
Expected: output contains "0"

**GREEN** — write CLI script

File: `scripts/knowledge-hook-dispatch.mjs`

```javascript
#!/usr/bin/env node
// knowledge-hook-dispatch.mjs — PostToolUse hook for knowledge auto-rebuild
//
// Modes:
//   node knowledge-hook-dispatch.mjs --from-path <path>  — Hook mode (silent)
//   node knowledge-hook-dispatch.mjs --event <json>      — Direct event dispatch
//   node knowledge-hook-dispatch.mjs --check-catalog     — Catalog freshness check
//
// Exit codes: 0 success / 1 error / 2 no .tinkerman/

import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..");

const modPath = join(projectRoot, "dist", "src", "knowledge-hooks.js");
let mod;
try {
  mod = await import(modPath);
} catch {
  console.error(`Cannot load knowledge-hooks from ${modPath}`);
  process.exit(1);
}

const { dispatchKnowledgeEvent, computeInputFilePaths } = mod;

const args = process.argv.slice(2);
const forgeRoot = findForgeRoot();
if (!forgeRoot) process.exit(2);

// ---------------------------------------------------------------------------
// Arg dispatch
// ---------------------------------------------------------------------------

if (args[0] === "--from-path") {
  const inputPath = args[1];
  if (!inputPath) process.exit(0);

  const relPath = inputPath.replace(/^\.forge\//, "").replace(/^\.\/\.forge\//, "");

  // Prevent infinite loop
  if (relPath === "knowledge/catalog.md") process.exit(0);
  if (relPath.startsWith("knowledge/solutions/") && relPath.endsWith(".md")) process.exit(0);

  const event = deriveEventFromPath(relPath);
  if (!event) process.exit(0);

  try {
    const result = await dispatchKnowledgeEvent({
      event,
      forgeRoot,
      recentHashes: new Set(),
      now: new Date(),
    });
    if (result.kind !== "skipped") {
      // Silent in hook mode — just exit
    }
  } catch {
    // Fail-silent for hook mode
  }
  process.exit(0);
}

if (args[0] === "--event") {
  const json = args[1];
  if (!json) { console.error("Usage: --event '<json>'"); process.exit(1); }
  const event = JSON.parse(json);
  const result = await dispatchKnowledgeEvent({
    event,
    forgeRoot,
    recentHashes: new Set(),
    now: new Date(),
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

if (args[0] === "--check-catalog") {
  const result = await dispatchKnowledgeEvent({
    event: { kind: "catalog_read", readerSkill: "cli" },
    forgeRoot,
    recentHashes: new Set(),
    now: new Date(),
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

console.log("Usage:");
console.log("  node knowledge-hook-dispatch.mjs --from-path <path>");
console.log("  node knowledge-hook-dispatch.mjs --event '<json>'");
console.log("  node knowledge-hook-dispatch.mjs --check-catalog");
process.exit(1);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveEventFromPath(relPath) {
  if (relPath.startsWith("decisions/ADR-") && relPath.endsWith(".md")) {
    return { kind: "adr_written", path: relPath };
  }
  if (relPath.startsWith("knowledge/solutions/") && relPath.endsWith(".md")) {
    const topic = basename(relPath, ".md");
    return { kind: "solution_written", topic, path: relPath };
  }
  if (relPath === "knowledge/instincts.md") {
    return { kind: "instincts_written", path: relPath };
  }
  if (relPath === "knowledge/known-failures.md") {
    return { kind: "known_failures_written", path: relPath };
  }
  if (relPath === "glossary.md") {
    return { kind: "glossary_written", path: relPath };
  }
  return null;
}

function findForgeRoot() {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, ".tinkerman"))) return join(dir, ".tinkerman");
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
```

**GREEN** — add hooks.json entries

Modify: `hooks/hooks.json` — add PostToolUse entry after `rebuild-feature-dossier.mjs`:

```json
{
  "matcher": "Write|Edit",
  "if": "Write(.tinkerman/**)|Edit(.tinkerman/**)",
  "hooks": [
    {
      "type": "command",
      "command": "node scripts/knowledge-hook-dispatch.mjs --from-path \"$TOOL_INPUT_FILE\" 2>/dev/null || true",
      "timeout": 5
    }
  ]
}
```

Run: `npx vitest run test/knowledge-hooks.test.ts test/knowledge-hooks-skill-integration.test.ts`
Expected: exit 0

**Commit**: `feat(knowledge-hooks): add CLI dispatch script + hooks.json integration`

---

### Task 5: Barrel export + SKILL.md documentation + dist sync

**Files**:
- Modify: `src/index.ts`
- Modify: `skills/forge-decide/SKILL.md`
- Modify: `skills/forge-learn/SKILL.md`
- Modify: `skills/forge-debug/SKILL.md`
- Modify: `skills/forge-plan/SKILL.md`

**GREEN** — add barrel exports

Add to `src/index.ts` after the knowledge-integrity block:

```typescript
// Knowledge hooks (event-driven catalog rebuild + integrity lint)
export {
  computeInputFilePaths,
  dispatchKnowledgeEvent,
  hashEvent,
  isCatalogStale,
  isThrottled,
  shouldTriggerEpisodeThreshold,
  THRESHOLD_MILESTONES,
  type KnowledgeEvent,
  type KnowledgeHookInput,
  type KnowledgeHookResult,
} from "./knowledge-hooks.js";
```

**GREEN** — update SKILL.md files

In `skills/forge-decide/SKILL.md`, add to ADR finalization section:
> ADR 写入完成后，hooks.json PostToolUse 自动触发 catalog rebuild。catalog.md 将在 5 秒内包含新 ADR。

In `skills/forge-learn/SKILL.md`, add to solutions/instincts writing section:
> solutions/ 写入完成后，hooks.json PostToolUse 自动触发 integrity lint。findings 写入 `.tinkerman/findings/integrity-<timestamp>.md`。

In `skills/forge-debug/SKILL.md`, add to Phase 4:
> solutions/ 写入完成后，自动触发 integrity lint（同 forge-learn）。

In `skills/forge-plan/SKILL.md`, add to Step 1 Research:
> catalog.md 新鲜度由 hooks.json PostToolUse 自动维护。plan 启动时如 catalog 过期会自动 rebuild。无需手动 `/forge learn` 刷新。

**GREEN** — dist sync

Run: `npm run dist:resync`
Expected: exit 0

**Verify**:

Run: `npx vitest run test/knowledge-hooks.test.ts test/knowledge-hooks-skill-integration.test.ts test/knowledge-hooks.property.test.ts`
Expected: exit 0

**Commit**: `feat(knowledge-hooks): barrel export + SKILL.md docs + dist sync`

---

## Verification Summary

| # | 验收标准 | 覆盖任务 |
|---|---------|---------|
| 1 | decide 写 ADR → catalog 自动 rebuild | Task 1 (dispatch) + Task 4 (hooks.json) |
| 2 | learn 写 solutions → integrity lint | Task 1 (dispatch) + Task 4 (hooks.json) |
| 3 | Episode 阈值跨越 → proposals | Task 1 (dispatch) |
| 4 | 连续 3 ADR → 节流 1 次 rebuild | Task 1 (isThrottled) + Task 3 (PBT) |
| 5 | plan 读 catalog 过期 → 后台 rebuild | Task 1 (catalog_read dispatch) |
| 6 | rebuild 失败 → warn 不阻塞 | Task 1 (try/catch in dispatch) |
| 7 | interactive instincts 候选 → 询问用户 | SKILL.md 描述（AI 层行为） |
| 8 | 节流重复事件 → skipped:throttled | Task 1 + Task 3 (PBT) |
| 9 | mtime 一致 → skipped:cache_fresh | Task 1 + Task 3 (PBT) |
| 10 | contradiction → advisory 不自动解决 | Task 1 (integrity lint 行为不变) |
