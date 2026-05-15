/**
 * Spec Health — unified spec health assessment.
 *
 * Aggregates three dimensions (leak / scenario / glossary) into a single
 * ambiguity_score ([0, 1]) and a SpecHealthReport with verdict + recommendations.
 */
import { createHash } from "node:crypto";
import { lintScenarios } from "./scenario-linter.js";
import { detectSpecLeak } from "./spec-leak-detector.js";
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const LEAK_MAX_ERRORS = 5;
const SCENARIO_MAX_ERRORS = 3;
const GLOSSARY_MAX_ERRORS = 5;
const WEIGHT_LEAK = 0.4;
const WEIGHT_SCENARIO = 0.3;
const WEIGHT_GLOSSARY = 0.3;
// ---------------------------------------------------------------------------
// Score computation (pure, independently testable)
// ---------------------------------------------------------------------------
export function computeAmbiguityScore(dims) {
    const leakFactor = Math.max(0, 1 - dims.leak.errorCount / LEAK_MAX_ERRORS);
    const scenarioFactor = Math.max(0, 1 - dims.scenario.errorCount / SCENARIO_MAX_ERRORS);
    const glossaryFactor = Math.max(0, 1 - dims.glossary.errorCount / GLOSSARY_MAX_ERRORS);
    return (WEIGHT_LEAK * leakFactor + WEIGHT_SCENARIO * scenarioFactor + WEIGHT_GLOSSARY * glossaryFactor);
}
// ---------------------------------------------------------------------------
// Verdict classification (pure, independently testable)
// ---------------------------------------------------------------------------
export function classifyVerdict(score, _thresholds) {
    if (score >= 0.85)
        return "healthy";
    if (score >= 0.7)
        return "marginal";
    return "degraded";
}
// ---------------------------------------------------------------------------
// Glossary miss detection (internal helper)
// ---------------------------------------------------------------------------
const TECH_TERM_RE = /\b[A-Z][A-Za-z]+(?:\.[A-Z][A-Za-z]+)+\b/g;
const GHERKIN_KEYWORDS = new Set([
    "Given",
    "When",
    "Then",
    "And",
    "But",
    "Scenario",
    "Feature",
    "Background",
    "Examples",
]);
function computeGlossaryMissCount(specContent, registry) {
    const matches = specContent.matchAll(TECH_TERM_RE);
    let missCount = 0;
    for (const m of matches) {
        const term = m[0];
        if (GHERKIN_KEYWORDS.has(term))
            continue;
        if (!registry.byTerm.has(term)) {
            missCount++;
        }
    }
    return missCount;
}
// ---------------------------------------------------------------------------
// Recommendation generation
// ---------------------------------------------------------------------------
function generateRecommendations(dims, verdict) {
    if (verdict === "healthy") {
        return [{ kind: "no_action", reason: "All dimensions healthy" }];
    }
    const recs = [];
    if (verdict === "degraded" || verdict === "marginal") {
        recs.push({ kind: "trigger_grill", reason: `Spec ambiguity score ${verdict}` });
    }
    if (dims.leak.errorCount > 0) {
        recs.push({
            kind: "rerun_spec_review",
            reason: `${dims.leak.errorCount} implementation detail leaks detected`,
        });
    }
    if (dims.glossary.errorCount > 0) {
        recs.push({
            kind: "rerun_glossary_check",
            reason: `${dims.glossary.errorCount} undefined glossary terms`,
        });
    }
    return recs;
}
// ---------------------------------------------------------------------------
// Main orchestration: checkSpecHealth
// ---------------------------------------------------------------------------
export function checkSpecHealth(input) {
    const leakFindings = detectSpecLeak(input.specContent, input.specFilePath, input.bannedRegistry, input.glossaryRegistry, "spec");
    const lintFindings = lintScenarios(input.specContent, input.specFilePath);
    const errorLintCount = lintFindings.filter((f) => f.severity === "error").length;
    const glossaryMissCount = computeGlossaryMissCount(input.specContent, input.glossaryRegistry);
    const dimensions = {
        leak: {
            dimension: "leak",
            passed: leakFindings.length === 0,
            errorCount: leakFindings.length,
            details: leakFindings.map((f) => f.original),
        },
        scenario: {
            dimension: "scenario",
            passed: errorLintCount === 0,
            errorCount: errorLintCount,
            details: lintFindings.filter((f) => f.severity === "error").map((f) => f.message),
        },
        glossary: {
            dimension: "glossary",
            passed: glossaryMissCount === 0,
            errorCount: glossaryMissCount,
            details: [],
        },
    };
    const score = computeAmbiguityScore(dimensions);
    const verdict = classifyVerdict(score, input.thresholds);
    const recommendations = generateRecommendations(dimensions, verdict);
    return { ambiguityScore: score, dimensions, overallVerdict: verdict, recommendations };
}
// ---------------------------------------------------------------------------
// Advisory rendering
// ---------------------------------------------------------------------------
export function renderSpecHealthAdvisory(report) {
    const lines = [
        `## Spec Health Advisory`,
        `**Verdict**: ${report.overallVerdict}`,
        `**Score**: ${report.ambiguityScore.toFixed(2)}`,
        ``,
        `### Dimensions`,
    ];
    for (const dim of Object.values(report.dimensions)) {
        const icon = dim.passed ? "✅" : "❌";
        lines.push(`- ${dim.dimension}: ${icon} (${dim.errorCount} issues)`);
    }
    if (report.recommendations.length > 0) {
        lines.push("", "### Recommendations");
        for (const r of report.recommendations) {
            lines.push(`- [${r.kind}] ${r.reason}`);
        }
    }
    return lines.join("\n");
}
export function computeSpecHash(content) {
    return createHash("sha256").update(content).digest("hex");
}
export function parseHealthCache(frontmatter) {
    const health = frontmatter.health;
    if (typeof health !== "object" || health === null)
        return null;
    const h = health;
    const specHash = h.spec_hash;
    const score = h.score;
    const verdict = h.verdict;
    const generatedAt = h.generated_at;
    if (typeof specHash !== "string" || typeof score !== "number" || typeof generatedAt !== "string")
        return null;
    if (verdict !== "healthy" && verdict !== "marginal" && verdict !== "degraded")
        return null;
    return { specHash, score, verdict, generatedAt };
}
export function shouldRecompute(currentHash, cache) {
    if (!cache)
        return true;
    return currentHash !== cache.specHash;
}
//# sourceMappingURL=spec-health.js.map