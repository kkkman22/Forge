/**
 * Analyze Requirements pre-check — 5 rules (ANL-01~05).
 *
 * Called between requirements lock and design generation.
 * P0 → block lock; P1 → block entering design; P2/P3 → warning only.
 *
 * Validates: Requirement 3
 */
// ---------------------------------------------------------------------------
// EARS regex
// ---------------------------------------------------------------------------
const EARS_REGEX = /^当\s+.+\s+时\s+系统(?:应当)?\s+.+$/;
const EARS_LEGACY_REGEX = /^当\s+.+\s*则\s+.+$/;
// ---------------------------------------------------------------------------
// Vague terms (ANL-03)
// ---------------------------------------------------------------------------
const VAGUE_TERMS = [
    "适当",
    "合理",
    "等等",
    "等等",
    "之类的",
    "之类的",
    "maybe",
    "should probably",
    "reasonable",
    "appropriate",
    "etc",
];
// ---------------------------------------------------------------------------
// analyzeRequirements
// ---------------------------------------------------------------------------
export function analyzeRequirements(req) {
    const findings = [];
    const allClauses = req.earsCriteria;
    // ANL-01: EARS compliance
    for (const clause of allClauses) {
        if (!EARS_REGEX.test(clause.raw) && !EARS_LEGACY_REGEX.test(clause.raw)) {
            findings.push({
                rule: "ANL-01",
                severity: "P1",
                message: `Non-EARS acceptance criteria: "${clause.raw}"`,
                line: clause.line,
            });
        }
    }
    // ANL-02: Consistency — duplicate requirement titles
    const titles = req.userStories.map((us) => us.title);
    const seen = new Set();
    for (const title of titles) {
        if (seen.has(title)) {
            findings.push({
                rule: "ANL-02",
                severity: "P1",
                message: `Duplicate requirement title: "${title}"`,
            });
        }
        seen.add(title);
    }
    // ANL-03: Ambiguity — vague terms in EARS clauses
    for (const clause of allClauses) {
        for (const term of VAGUE_TERMS) {
            if (clause.raw.includes(term)) {
                findings.push({
                    rule: "ANL-03",
                    severity: "P2",
                    message: `Vague term "${term}" in criteria: "${clause.raw}"`,
                    line: clause.line,
                });
            }
        }
    }
    // ANL-04: Conflict — same when, different shall
    const conditionMap = new Map();
    for (const clause of allClauses) {
        if (!clause.when)
            continue;
        const existing = conditionMap.get(clause.when) ?? [];
        if (!existing.includes(clause.shall)) {
            existing.push(clause.shall);
        }
        conditionMap.set(clause.when, existing);
    }
    for (const [condition, behaviors] of conditionMap) {
        if (behaviors.length > 1) {
            findings.push({
                rule: "ANL-04",
                severity: "P0",
                message: `Conflicting behaviors for condition "${condition}": ${behaviors.join(" vs ")}`,
            });
        }
    }
    // ANL-05: Completeness — must have at least one requirement
    if (allClauses.length === 0 || req.userStories.length === 0) {
        findings.push({
            rule: "ANL-05",
            severity: "P0",
            message: "No acceptance criteria or requirements defined",
        });
    }
    // Determine result
    const hasP0 = findings.some((f) => f.severity === "P0");
    const hasP1 = findings.some((f) => f.severity === "P1");
    return {
        pass: !hasP0,
        shouldBlockDesign: hasP0 || hasP1,
        findings,
    };
}
//# sourceMappingURL=spec-analyze.js.map