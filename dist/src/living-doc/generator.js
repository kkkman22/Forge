import * as fs from "node:fs";
import * as path from "node:path";
// ---------------------------------------------------------------------------
// parseSpecScenarios
// ---------------------------------------------------------------------------
export function parseSpecScenarios(specContent, _specPath) {
    const lines = specContent.split("\n");
    let context = null;
    const scenarios = [];
    // 1. Extract context from frontmatter (between --- markers)
    let inFrontmatter = false;
    let frontmatterEnded = false;
    for (const line of lines) {
        if (line.trim() === "---") {
            if (!inFrontmatter && !frontmatterEnded) {
                inFrontmatter = true;
                continue;
            }
            if (inFrontmatter) {
                frontmatterEnded = true;
                break;
            }
        }
        if (inFrontmatter) {
            const match = line.match(/^context:\s*(.+)$/);
            if (match) {
                context = match[1].trim();
            }
        }
    }
    // 2. Find "## Scenarios" section
    let inScenariosSection = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^##\s+Scenarios/.test(line)) {
            inScenariosSection = true;
            continue;
        }
        // Stop if we hit another ## heading that is not Scenarios
        if (inScenariosSection && /^##\s+/.test(line) && !/^##\s+Scenarios/.test(line)) {
            inScenariosSection = false;
            continue;
        }
        if (!inScenariosSection)
            continue;
        // 3. Match scenario headings: "### Scenario N: <title>" or "### <title>"
        const scenarioWithNumber = line.match(/^###\s+Scenario\s+\d+:\s*(.+)$/);
        const scenarioBare = line.match(/^###\s+(.+)$/);
        let rawTitle = null;
        if (scenarioWithNumber) {
            rawTitle = scenarioWithNumber[1];
        }
        else if (scenarioBare) {
            rawTitle = scenarioBare[1];
        }
        if (rawTitle !== null) {
            // 4. Extract tags from [tag] markers
            const tags = [];
            const tagRegex = /\[([^\]]+)\]/g;
            let tagMatch = tagRegex.exec(rawTitle);
            while (tagMatch !== null) {
                tags.push(tagMatch[1]);
                tagMatch = tagRegex.exec(rawTitle);
            }
            // Remove tags from title
            const title = rawTitle.replace(/\s*\[[^\]]+\]\s*/g, " ").trim();
            scenarios.push({
                title,
                tags,
                sourceLine: i + 1, // 1-based line number
            });
        }
    }
    return { context, scenarios };
}
// ---------------------------------------------------------------------------
// parseAcceptanceVerdicts
// ---------------------------------------------------------------------------
const VERDICT_PATTERNS = [
    { pattern: /✅\s*PASS/, verdict: "pass" },
    { pattern: /❌\s*FAIL/, verdict: "fail" },
    { pattern: /⏳\s*PENDING/, verdict: "pending" },
    { pattern: /⏭\s*SKIP/, verdict: "skip" },
];
export function parseAcceptanceVerdicts(reportContent, _reportPath) {
    const result = new Map();
    if (!reportContent)
        return result;
    const timestamp = new Date().toISOString();
    const lines = reportContent.split("\n");
    for (const line of lines) {
        // Match: - **Scenario**: <title> — <emoji> <STATUS>
        const match = line.match(/^-\s+\*\*Scenario\*\*:\s*(.+?)\s*—\s*(.+)$/);
        if (match) {
            const title = match[1].trim();
            const statusPart = match[2];
            for (const { pattern, verdict } of VERDICT_PATTERNS) {
                if (pattern.test(statusPart)) {
                    result.set(title, { verdict, timestamp });
                    break;
                }
            }
        }
    }
    return result;
}
// ---------------------------------------------------------------------------
// generateLivingDoc
// ---------------------------------------------------------------------------
export function generateLivingDoc(specsDir, acceptanceDir) {
    const globalStats = { totalScenarios: 0, pass: 0, fail: 0, pending: 0 };
    const contexts = new Map();
    // 3. Parse acceptance reports if directory provided
    const allVerdicts = new Map();
    if (acceptanceDir && fs.existsSync(acceptanceDir)) {
        const reportFiles = fs.readdirSync(acceptanceDir).filter((f) => f.endsWith(".md"));
        for (const reportFile of reportFiles) {
            const reportPath = path.join(acceptanceDir, reportFile);
            const content = fs.readFileSync(reportPath, "utf-8");
            const verdicts = parseAcceptanceVerdicts(content, reportPath);
            for (const [title, entry] of verdicts) {
                // Later reports overwrite earlier ones for same scenario title
                allVerdicts.set(title, {
                    verdict: entry.verdict,
                    timestamp: entry.timestamp,
                    reportPath,
                });
            }
        }
    }
    // 1-2. List spec files and parse them
    const specFiles = fs.existsSync(specsDir)
        ? fs.readdirSync(specsDir).filter((f) => f.endsWith(".md"))
        : [];
    const DEFAULT_CONTEXT = "default";
    for (const specFile of specFiles) {
        const specPath = path.join(specsDir, specFile);
        const content = fs.readFileSync(specPath, "utf-8");
        const parsed = parseSpecScenarios(content, specPath);
        const contextName = parsed.context ?? DEFAULT_CONTEXT;
        // 4-5. Merge verdicts and build scenarios
        const scenarios = parsed.scenarios.map((s) => {
            const verdictEntry = allVerdicts.get(s.title);
            let lastVerdict = "pending";
            let lastRunAt = null;
            let acceptanceReportPath = null;
            if (verdictEntry) {
                lastVerdict = verdictEntry.verdict;
                lastRunAt = verdictEntry.timestamp;
                acceptanceReportPath = verdictEntry.reportPath;
            }
            return {
                title: s.title,
                tags: s.tags,
                lastVerdict,
                lastRunAt,
                sourceLine: s.sourceLine,
                acceptanceReportPath,
            };
        });
        // 5. Group by context
        if (!contexts.has(contextName)) {
            contexts.set(contextName, {
                name: contextName,
                specs: [],
                stats: { total: 0, pass: 0, fail: 0, pending: 0 },
            });
        }
        const ctx = contexts.get(contextName);
        if (!ctx)
            continue;
        ctx.specs.push({
            topic: specFile.replace(/\.md$/, ""),
            scenarios,
            specPath,
        });
        // 6. Calculate context stats
        for (const s of scenarios) {
            ctx.stats.total++;
            globalStats.totalScenarios++;
            switch (s.lastVerdict) {
                case "pass":
                    ctx.stats.pass++;
                    globalStats.pass++;
                    break;
                case "fail":
                    ctx.stats.fail++;
                    globalStats.fail++;
                    break;
                case "pending":
                    ctx.stats.pending++;
                    globalStats.pending++;
                    break;
                case "skip":
                    // skip does not count toward pass/fail/pending
                    break;
            }
        }
    }
    return {
        generatedAt: new Date().toISOString(),
        contexts,
        globalStats,
    };
}
//# sourceMappingURL=generator.js.map