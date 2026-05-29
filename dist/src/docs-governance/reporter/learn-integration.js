import { summarize } from "./diagnostic.js";
export function extractLearnInsights(diagnostics, source) {
    const insights = [];
    // Count diagnostics by code
    const codeCounts = new Map();
    for (const d of diagnostics) {
        if (d.code) {
            codeCounts.set(d.code, (codeCounts.get(d.code) ?? 0) + 1);
        }
    }
    // Governance pattern: which checks fire most often
    if (codeCounts.size > 0) {
        insights.push({
            category: "governance-pattern",
            source,
            description: `Diagnostic frequency from ${source}: ${summarize(diagnostics)}`,
            data: Object.fromEntries(codeCounts),
        });
    }
    // Anti-pattern: files with multiple diagnostics
    const fileCounts = new Map();
    for (const d of diagnostics) {
        if (d.file) {
            fileCounts.set(d.file, (fileCounts.get(d.file) ?? 0) + 1);
        }
    }
    const hotspots = [...fileCounts.entries()].filter(([, c]) => c >= 3);
    if (hotspots.length > 0) {
        insights.push({
            category: "anti-pattern",
            source,
            description: `${hotspots.length} file(s) with 3+ diagnostics — candidates for focused cleanup`,
            data: Object.fromEntries(hotspots),
        });
    }
    // Trend: severity distribution
    const severityCounts = {
        critical: 0,
        error: 0,
        warning: 0,
        notice: 0,
        info: 0,
    };
    for (const d of diagnostics) {
        severityCounts[d.severity] = (severityCounts[d.severity] ?? 0) + 1;
    }
    insights.push({
        category: "trend",
        source,
        description: `Severity distribution from ${source}`,
        data: severityCounts,
    });
    return insights;
}
export function formatLearnInsights(insights) {
    const lines = ["## Docs Governance Learn Insights", ""];
    for (const i of insights) {
        lines.push(`### ${i.category}: ${i.source}`);
        lines.push(i.description);
        const entries = Object.entries(i.data)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10);
        for (const [k, v] of entries) {
            lines.push(`  - ${k}: ${v}`);
        }
        lines.push("");
    }
    return lines.join("\n");
}
//# sourceMappingURL=learn-integration.js.map