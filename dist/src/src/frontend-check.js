import { globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
export function detectTierAvailability(env) {
    const reasons = {
        cmuxSocket: env.socketExists,
        cmuxWorkspaceEnv: env.workspaceIdSet,
        cmuxBinary: env.cmuxBinaryExists,
        mcpDevtools: env.mcpDevtoolsResponsive,
    };
    let b;
    if (!env.cmuxBinaryExists) {
        b = "unavailable";
    }
    else if (env.socketExists && env.workspaceIdSet) {
        b = "preferred";
    }
    else {
        b = "degraded";
    }
    const c = env.mcpDevtoolsResponsive ? "available" : "unavailable";
    return { a: true, b, c, reasons };
}
export function scanVueTemplate(content, filePath, rules) {
    const violations = [];
    const lines = content.split("\n");
    for (const rule of rules) {
        try {
            const re = new RegExp(rule.pattern);
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (!re.test(line))
                    continue;
                // Check false positive filters
                const isFalsePositive = rule.falsePositiveFilter.some((fp) => line.includes(fp));
                if (isFalsePositive)
                    continue;
                violations.push({
                    ruleId: rule.id,
                    severity: rule.severity,
                    file: filePath,
                    line: i + 1,
                    wcag: rule.wcag,
                    snippet: line.trim(),
                });
            }
        }
        catch {
            // Invalid regex — skip this rule
        }
    }
    return violations;
}
const IMPACT_TO_SEVERITY = {
    critical: "P0",
    serious: "P1",
    moderate: "P2",
    minor: "P3",
};
export function parseAxeResult(json) {
    const violations = [];
    let p0 = 0;
    let p1 = 0;
    let p2 = 0;
    let p3 = 0;
    const data = json;
    const rawViolations = Array.isArray(data?.violations) ? data.violations : [];
    for (const v of rawViolations) {
        const entry = v;
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
// ---------------------------------------------------------------------------
// Project-level driver
// ---------------------------------------------------------------------------
export function scanVueProject(projectRoot, rules, patterns = ["src/**/*.vue", "src/**/*.tsx"]) {
    const violations = [];
    for (const pattern of patterns) {
        const matches = globSync(pattern, { cwd: projectRoot });
        for (const relative of matches) {
            const absolute = resolve(projectRoot, relative);
            const content = readFileSync(absolute, "utf-8");
            violations.push(...scanVueTemplate(content, absolute, rules));
        }
    }
    return violations;
}
//# sourceMappingURL=frontend-check.js.map