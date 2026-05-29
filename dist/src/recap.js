// Time-window recap engine — aggregates git, sessions, and progress data.
//
// Parses --since window, merges 3 data sources, categorizes entries,
// scans for stale evolved rules.
//
// Validates: Requirements R9.1-R9.5, R13.6
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const CATEGORY_KEYWORDS = {
    feature: ["feat", "add", "implement", "create", "new"],
    bugfix: ["fix", "bug", "patch", "resolve", "repair"],
    refactor: ["refactor", "restructure", "reorganize", "clean"],
    infra: ["ci", "build", "deploy", "config", "infra", "ops"],
    docs: ["doc", "readme", "comment", "changelog"],
};
export function runRecap(opts) {
    const window = opts?.window ?? "7d";
    const forgeDir = opts?.forgeDir ?? join(process.cwd(), ".forge");
    const { since, until } = parseWindow(window);
    const commits = parseGitLog(since);
    const sessions = parseSessions(forgeDir, since);
    const tasks = parseProgress(forgeDir, since);
    const allEntries = [...commits, ...sessions, ...tasks];
    const categories = categorizeEntries(allEntries);
    const staleRules = findStaleRules(forgeDir);
    return {
        window,
        since,
        until,
        categories,
        staleRules,
        totalCommits: commits.length,
        totalSessions: sessions.length,
        totalTasks: tasks.length,
    };
}
function parseWindow(window) {
    const until = new Date().toISOString().split("T")[0];
    if (window.includes("..")) {
        const [from, to] = window.split("..");
        return { since: from, until: to || until };
    }
    const match = window.match(/^(\d+)(d|w)$/);
    if (match) {
        const count = Number.parseInt(match[1], 10);
        const unit = match[2];
        const days = unit === "w" ? count * 7 : count;
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - days);
        return { since: sinceDate.toISOString().split("T")[0], until };
    }
    // Try as date
    return { since: window, until };
}
function parseGitLog(since) {
    try {
        const output = execSync(`git log --since="${since}" --pretty=format:"%H|%an|%aI|%s" --no-merges`, { encoding: "utf-8", timeout: 10000, stdio: ["pipe", "pipe", "pipe"] });
        return output
            .trim()
            .split("\n")
            .filter((line) => line.trim())
            .map((line) => {
            const [_hash, author, date, ...msgParts] = line.split("|");
            return {
                type: "commit",
                message: msgParts.join("|"),
                author: author || undefined,
                date: date || since,
                category: "uncategorized",
            };
        });
    }
    catch {
        return [];
    }
}
function parseSessions(forgeDir, since) {
    const sessionsDir = join(forgeDir, "knowledge", "sessions");
    if (!existsSync(sessionsDir))
        return [];
    try {
        return readdirSync(sessionsDir)
            .filter((f) => f.endsWith(".md"))
            .map((f) => ({
            type: "session",
            message: f.replace(".md", ""),
            date: since,
            category: "uncategorized",
        }));
    }
    catch {
        return [];
    }
}
function parseProgress(forgeDir, since) {
    const progressDir = join(forgeDir, "progress");
    if (!existsSync(progressDir))
        return [];
    try {
        return readdirSync(progressDir)
            .filter((f) => f.endsWith(".md"))
            .map((f) => ({
            type: "task",
            message: f.replace(".md", ""),
            date: since,
            category: "uncategorized",
        }));
    }
    catch {
        return [];
    }
}
function categorizeEntries(entries) {
    const result = {};
    for (const entry of entries) {
        let matched = false;
        for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
            if (keywords.some((kw) => entry.message.toLowerCase().includes(kw))) {
                entry.category = category;
                if (!result[category])
                    result[category] = [];
                result[category].push(entry);
                matched = true;
                break;
            }
        }
        if (!matched) {
            if (!result.uncategorized)
                result.uncategorized = [];
            result.uncategorized.push(entry);
        }
    }
    return result;
}
function findStaleRules(forgeDir) {
    const rulesPath = join(forgeDir, "knowledge", "evolved-rules.md");
    if (!existsSync(rulesPath))
        return [];
    try {
        const content = readFileSync(rulesPath, "utf-8");
        const staleRules = [];
        const ruleRegex = /### R(\d+):/g;
        let ruleMatch = ruleRegex.exec(content);
        while (ruleMatch !== null) {
            const afterMatch = content.slice(ruleMatch.index);
            const triggeredMatch = afterMatch.match(/Last_triggered:\s*(\d{4}-\d{2}-\d{2})/);
            if (triggeredMatch) {
                const lastDate = new Date(triggeredMatch[1]);
                const daysSince = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
                if (daysSince > 30) {
                    staleRules.push(`R${ruleMatch[1]}`);
                }
            }
            ruleMatch = ruleRegex.exec(content);
        }
        return staleRules;
    }
    catch {
        return [];
    }
}
//# sourceMappingURL=recap.js.map