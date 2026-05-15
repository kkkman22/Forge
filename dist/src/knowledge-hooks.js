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
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildCatalog, parseEvolvedRulesSummary, parseFailureSummary, parseSolutionFrontmatter, } from "./knowledge-catalog.js";
import { lintKnowledgeIntegrity } from "./knowledge-integrity.js";
import { parseInstinct } from "./pattern-stats.js";
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export const THRESHOLD_MILESTONES = [5, 10, 25, 50, 100, 250];
const THROTTLE_MS = 5000;
// ---------------------------------------------------------------------------
// Pure scheduling functions
// ---------------------------------------------------------------------------
export function hashEvent(event) {
    const tag = `${event.kind}:${JSON.stringify(event)}`;
    let h = 0;
    for (let i = 0; i < tag.length; i++) {
        h = ((h << 5) - h + tag.charCodeAt(i)) | 0;
    }
    return h.toString(36);
}
export function isThrottled(event, recentHashes, _throttleMs = THROTTLE_MS) {
    return recentHashes.has(hashEvent(event));
}
export function isCatalogStale(catalogMtime, inputFilesMtimes) {
    const maxInputMtime = Math.max(...inputFilesMtimes, 0);
    return maxInputMtime > catalogMtime;
}
export function shouldTriggerEpisodeThreshold(previousCount, currentCount) {
    for (const ms of THRESHOLD_MILESTONES) {
        if (previousCount < ms && currentCount >= ms)
            return ms;
    }
    return null;
}
export function computeInputFilePaths(knowledgeDir) {
    const paths = [
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
export async function dispatchKnowledgeEvent(input) {
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
function dispatchCatalogRebuild(knowledgeDir, now) {
    const start = Date.now();
    try {
        const catalogPath = join(knowledgeDir, "catalog.md");
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
    }
    catch (e) {
        // biome-ignore lint/suspicious/noConsole: hook-sidecar diagnostic, not app output
        console.warn(`knowledge-hooks: catalog rebuild failed: ${e.message}`);
        return { kind: "skipped", reason: "no_change_detected" };
    }
}
function dispatchIntegrityLint(knowledgeDir) {
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
    }
    catch (e) {
        // biome-ignore lint/suspicious/noConsole: hook-sidecar diagnostic, not app output
        console.warn(`knowledge-hooks: integrity lint failed: ${e.message}`);
        return { kind: "linted", findings: [] };
    }
}
function dispatchInstinctsProposals(_knowledgeDir, _now) {
    try {
        // Episode data comes from the episode store; currently returns empty
        // until episode threshold driver integration (post-build hook)
        const proposals = [];
        return { kind: "instincts_proposals", proposals };
    }
    catch (e) {
        // biome-ignore lint/suspicious/noConsole: hook-sidecar diagnostic, not app output
        console.warn(`knowledge-hooks: instincts proposals failed: ${e.message}`);
        return { kind: "instincts_proposals", proposals: [] };
    }
}
function dispatchCatalogFreshnessCheck(knowledgeDir, now) {
    try {
        const catalogPath = join(knowledgeDir, "catalog.md");
        if (!existsSync(catalogPath)) {
            return dispatchCatalogRebuild(knowledgeDir, now);
        }
        const catalogMtime = statSync(catalogPath).mtimeMs;
        const inputPaths = computeInputFilePaths(knowledgeDir);
        const inputMtimes = inputPaths.filter((p) => existsSync(p)).map((p) => statSync(p).mtimeMs);
        if (isCatalogStale(catalogMtime, inputMtimes)) {
            return dispatchCatalogRebuild(knowledgeDir, now);
        }
        return { kind: "skipped", reason: "cache_fresh" };
    }
    catch {
        return { kind: "skipped", reason: "cache_fresh" };
    }
}
// ---------------------------------------------------------------------------
// File readers
// ---------------------------------------------------------------------------
function readPatterns(knowledgeDir) {
    const path = join(knowledgeDir, "instincts.md");
    if (!existsSync(path))
        return [];
    return parseInstinct(readFileSync(path, "utf-8"));
}
function readSolutions(knowledgeDir) {
    const solutionsDir = join(knowledgeDir, "solutions");
    if (!existsSync(solutionsDir))
        return [];
    const results = [];
    for (const f of readdirSync(solutionsDir)) {
        if (!f.endsWith(".md"))
            continue;
        const topic = f.replace(/\.md$/, "");
        const content = readFileSync(join(solutionsDir, f), "utf-8");
        const summary = parseSolutionFrontmatter(topic, content);
        if (summary)
            results.push(summary);
    }
    return results;
}
function readFailures(knowledgeDir) {
    const path = join(knowledgeDir, "known-failures.md");
    if (!existsSync(path))
        return null;
    return parseFailureSummary(readFileSync(path, "utf-8"));
}
function readRules(knowledgeDir) {
    const path = join(knowledgeDir, "evolved-rules.md");
    if (!existsSync(path))
        return null;
    return parseEvolvedRulesSummary(readFileSync(path, "utf-8"));
}
function buildIntegrityInput(knowledgeDir) {
    const solutionsDir = join(knowledgeDir, "solutions");
    const solutions = new Map();
    if (existsSync(solutionsDir)) {
        for (const f of readdirSync(solutionsDir)) {
            if (!f.endsWith(".md"))
                continue;
            solutions.set(f.replace(/\.md$/, ""), readFileSync(join(solutionsDir, f), "utf-8"));
        }
    }
    const sessionsDir = join(knowledgeDir, "sessions");
    const sessionFiles = [];
    if (existsSync(sessionsDir)) {
        for (const f of readdirSync(sessionsDir)) {
            if (f.endsWith(".md"))
                sessionFiles.push(f);
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
function tryRead(path) {
    return existsSync(path) ? readFileSync(path, "utf-8") : "";
}
// ---------------------------------------------------------------------------
// Report renderers
// ---------------------------------------------------------------------------
function renderFindingsReport(findings) {
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
//# sourceMappingURL=knowledge-hooks.js.map