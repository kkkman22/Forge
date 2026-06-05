/**
 * Knowledge Hooks — event-driven scheduling layer for catalog rebuild
 * and integrity lint.
 *
 * Dispatches events from file-write triggers to the existing
 * knowledge-catalog and knowledge-integrity pure function libraries.
 * Zero modifications to those libraries.
 *
 * Pure: hashEvent, isThrottled, isCatalogStale, shouldTriggerEpisodeThreshold.
 * IO:    dispatchKnowledgeEvent reads knowledge files and writes results.
 */

import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SolutionSummary } from "./knowledge-catalog.js";
import {
  buildCatalog,
  parseEvolvedRulesSummary,
  parseFailureSummary,
  parseSolutionFrontmatter,
} from "./knowledge-catalog.js";
import type { IntegrityFinding, IntegrityInput } from "./knowledge-integrity.js";
import { lintKnowledgeIntegrity } from "./knowledge-integrity.js";
import type { Pattern, UpgradeSuggestion } from "./pattern-stats.js";
import { parseInstinct } from "./pattern-stats.js";

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
// Helpers
// ---------------------------------------------------------------------------

/** Async file existence check — resolves true/false, never rejects. */
async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

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

export function isCatalogStale(catalogMtime: number, inputFilesMtimes: number[]): boolean {
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

export async function computeInputFilePaths(knowledgeDir: string): Promise<string[]> {
  const paths: string[] = [
    join(knowledgeDir, "instincts.md"),
    join(knowledgeDir, "known-failures.md"),
    join(knowledgeDir, "evolved-rules.md"),
    join(knowledgeDir, "..", "glossary.md"),
  ];
  const decisionsDir = join(knowledgeDir, "..", "decisions");
  if (await pathExists(decisionsDir)) {
    for (const f of await readdir(decisionsDir)) {
      if (f.startsWith("ADR-") && f.endsWith(".md")) {
        paths.push(join(decisionsDir, f));
      }
    }
  }
  const solutionsDir = join(knowledgeDir, "solutions");
  if (await pathExists(solutionsDir)) {
    for (const f of await readdir(solutionsDir)) {
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

async function dispatchCatalogRebuild(
  knowledgeDir: string,
  now: Date,
): Promise<KnowledgeHookResult> {
  const start = Date.now();
  try {
    const catalogPath = join(knowledgeDir, "catalog.md");
    const patterns = await readPatterns(knowledgeDir);
    const solutions = await readSolutions(knowledgeDir);
    const failures = await readFailures(knowledgeDir);
    const rules = await readRules(knowledgeDir);

    const catalogContent = buildCatalog({
      patterns,
      solutions,
      failures: failures ?? undefined,
      rules: rules ?? undefined,
      generatedAt: now,
    });

    await mkdir(knowledgeDir, { recursive: true });
    await writeFile(catalogPath, catalogContent, "utf-8");

    return {
      kind: "rebuilt",
      affectedFiles: [catalogPath],
      durationMs: Date.now() - start,
    };
  } catch (e: unknown) {
    // biome-ignore lint/suspicious/noConsole: hook-sidecar diagnostic, not app output
    console.warn(
      `knowledge-hooks: catalog rebuild failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return { kind: "skipped", reason: "no_change_detected" as const };
  }
}

async function dispatchIntegrityLint(knowledgeDir: string): Promise<KnowledgeHookResult> {
  try {
    const integrityInput = await buildIntegrityInput(knowledgeDir);
    const findings = lintKnowledgeIntegrity(integrityInput);

    if (findings.length > 0) {
      const findingsDir = join(knowledgeDir, "..", "findings");
      await mkdir(findingsDir, { recursive: true });
      const findingsPath = join(findingsDir, `integrity-${Date.now()}.md`);
      const content = renderFindingsReport(findings);
      await writeFile(findingsPath, content, "utf-8");
    }

    return { kind: "linted", findings };
  } catch (e: unknown) {
    // biome-ignore lint/suspicious/noConsole: hook-sidecar diagnostic, not app output
    console.warn(
      `knowledge-hooks: integrity lint failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return { kind: "linted", findings: [] };
  }
}

function dispatchInstinctsProposals(_knowledgeDir: string, _now: Date): KnowledgeHookResult {
  try {
    // Episode data comes from the episode store; currently returns empty
    // until episode threshold driver integration (post-build hook)
    const proposals: UpgradeSuggestion[] = [];
    return { kind: "instincts_proposals", proposals };
  } catch (e: unknown) {
    // biome-ignore lint/suspicious/noConsole: hook-sidecar diagnostic, not app output
    console.warn(
      `knowledge-hooks: instincts proposals failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return { kind: "instincts_proposals", proposals: [] };
  }
}

async function dispatchCatalogFreshnessCheck(
  knowledgeDir: string,
  now: Date,
): Promise<KnowledgeHookResult> {
  try {
    const catalogPath = join(knowledgeDir, "catalog.md");
    if (!(await pathExists(catalogPath))) {
      return dispatchCatalogRebuild(knowledgeDir, now);
    }

    const catalogMtime = (await stat(catalogPath)).mtimeMs;
    const inputPaths = await computeInputFilePaths(knowledgeDir);

    const inputMtimes: number[] = [];
    for (const p of inputPaths) {
      if (await pathExists(p)) {
        inputMtimes.push((await stat(p)).mtimeMs);
      }
    }

    if (isCatalogStale(catalogMtime, inputMtimes)) {
      return dispatchCatalogRebuild(knowledgeDir, now);
    }

    return { kind: "skipped", reason: "cache_fresh" };
  } catch (_err: unknown) {
    return { kind: "skipped", reason: "cache_fresh" };
  }
}

// ---------------------------------------------------------------------------
// File readers
// ---------------------------------------------------------------------------

async function readPatterns(knowledgeDir: string): Promise<Pattern[]> {
  const path = join(knowledgeDir, "instincts.md");
  if (!(await pathExists(path))) return [];
  return parseInstinct(await readFile(path, "utf-8"));
}

async function readSolutions(knowledgeDir: string): Promise<SolutionSummary[]> {
  const solutionsDir = join(knowledgeDir, "solutions");
  if (!(await pathExists(solutionsDir))) return [];
  const results: SolutionSummary[] = [];
  for (const f of await readdir(solutionsDir)) {
    if (!f.endsWith(".md")) continue;
    const topic = f.replace(/\.md$/, "");
    const content = await readFile(join(solutionsDir, f), "utf-8");
    const summary = parseSolutionFrontmatter(topic, content);
    if (summary) results.push(summary);
  }
  return results;
}

async function readFailures(knowledgeDir: string) {
  const path = join(knowledgeDir, "known-failures.md");
  if (!(await pathExists(path))) return null;
  return parseFailureSummary(await readFile(path, "utf-8"));
}

async function readRules(knowledgeDir: string) {
  const path = join(knowledgeDir, "evolved-rules.md");
  if (!(await pathExists(path))) return null;
  return parseEvolvedRulesSummary(await readFile(path, "utf-8"));
}

async function buildIntegrityInput(knowledgeDir: string): Promise<IntegrityInput> {
  const solutionsDir = join(knowledgeDir, "solutions");
  const solutions = new Map<string, string>();
  if (await pathExists(solutionsDir)) {
    for (const f of await readdir(solutionsDir)) {
      if (!f.endsWith(".md")) continue;
      solutions.set(f.replace(/\.md$/, ""), await readFile(join(solutionsDir, f), "utf-8"));
    }
  }

  const sessionsDir = join(knowledgeDir, "sessions");
  const sessionFiles: string[] = [];
  if (await pathExists(sessionsDir)) {
    for (const f of await readdir(sessionsDir)) {
      if (f.endsWith(".md")) sessionFiles.push(f);
    }
  }

  return {
    instinctsContent: await tryRead(join(knowledgeDir, "instincts.md")),
    evolvedRulesContent: await tryRead(join(knowledgeDir, "evolved-rules.md")),
    knownFailuresContent: await tryRead(join(knowledgeDir, "known-failures.md")),
    solutions,
    sessionFiles,
  };
}

async function tryRead(path: string): Promise<string> {
  return (await pathExists(path)) ? await readFile(path, "utf-8") : "";
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
