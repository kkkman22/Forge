import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "./frontmatter.js";
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export const STAGE_NAMES = [
    "decisions",
    "specs",
    "plans",
    "reviews",
    "progress",
    "findings",
    "debug",
];
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function emptyStages() {
    return {
        decisions: [],
        specs: [],
        plans: [],
        reviews: [],
        progress: [],
        findings: [],
        debug: [],
    };
}
function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
// ---------------------------------------------------------------------------
// deriveTopicFromPath — reverse mapping (Hook → Topic_Key)
// ---------------------------------------------------------------------------
export function deriveTopicFromPath(relPath) {
    if (!relPath)
        return null;
    // decisions/<date>-<topic>.md
    let m = relPath.match(/^decisions\/\d{4}-\d{2}-\d{2}-(.+)\.md$/);
    if (m)
        return m[1];
    // decisions/ADR-<NNNN>-<topic>.md
    m = relPath.match(/^decisions\/ADR-\d{4}-(.+)\.md$/);
    if (m)
        return m[1];
    // specs/<topic>/spec.md
    m = relPath.match(/^specs\/([^/]+)\/spec\.md$/);
    if (m)
        return m[1];
    // plans|reviews|progress|findings|debug/<topic>.md
    m = relPath.match(/^(plans|reviews|progress|findings|debug)\/(.+)\.md$/);
    if (m)
        return m[2];
    return null;
}
// ---------------------------------------------------------------------------
// matchStageFiles — forward pattern matching (pure function)
// ---------------------------------------------------------------------------
export function matchStageFiles(stage, topic, files) {
    const escaped = escapeRegExp(topic);
    if (stage === "decisions") {
        const dateRe = new RegExp(`^\\d{4}-\\d{2}-\\d{2}-${escaped}\\.md$`);
        const adrRe = new RegExp(`^ADR-\\d{4}-${escaped}\\.md$`);
        return files.filter((f) => dateRe.test(f) || adrRe.test(f));
    }
    if (stage === "specs") {
        // specs uses directory matching; files are from inside specs/<topic>/
        // Only spec.md is relevant
        return files.includes("spec.md") ? ["spec.md"] : [];
    }
    // Exact match for plans, reviews, progress, findings, debug
    const exactRe = new RegExp(`^${escaped}\\.md$`);
    return files.filter((f) => exactRe.test(f));
}
// ---------------------------------------------------------------------------
// scanStagesForTopic
// ---------------------------------------------------------------------------
export function scanStagesForTopic(topic, forgeRoot) {
    // Path traversal defense: reject topic with path separators or traversal
    if (topic.includes("/") || topic.includes("\\") || topic.includes("..")) {
        return { topic, forgeRoot, stages: emptyStages() };
    }
    const stages = {
        decisions: [],
        specs: [],
        plans: [],
        reviews: [],
        progress: [],
        findings: [],
        debug: [],
    };
    for (const stage of STAGE_NAMES) {
        const stageDir = path.join(forgeRoot, stage);
        let entries;
        try {
            entries = fs.readdirSync(stageDir);
        }
        catch {
            continue;
        }
        if (stage === "specs") {
            // specs/<topic>/spec.md
            const specDir = path.join(stageDir, topic);
            try {
                const specFiles = fs.readdirSync(specDir);
                if (specFiles.includes("spec.md")) {
                    stages.specs.push(readStageFile(stageDir, `${topic}/spec.md`, stage));
                }
            }
            catch {
                // directory doesn't exist, skip
            }
            continue;
        }
        const matched = matchStageFiles(stage, topic, entries);
        for (const name of matched) {
            stages[stage].push(readStageFile(stageDir, name, stage));
        }
    }
    return { topic, forgeRoot, stages };
}
function readStageFile(stageDir, relativeName, stage) {
    const fullPath = path.join(stageDir, relativeName);
    let content;
    let mtime;
    try {
        content = fs.readFileSync(fullPath, "utf-8");
        mtime = fs.statSync(fullPath).mtime.toISOString();
    }
    catch {
        return {
            path: path.join(path.basename(stageDir), relativeName),
            mtime: "",
            frontmatter: {},
            firstSection: "",
        };
    }
    const parsed = parseFrontmatter(content);
    const frontmatter = {};
    if (parsed?.raw) {
        for (const line of parsed.raw.split("\n")) {
            const kv = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
            if (kv) {
                const val = kv[2].trim().replace(/^"(.*)"$/, "$1");
                frontmatter[kv[1]] = val || true;
            }
        }
    }
    // Extract first section (from first ## to next ## or EOF, max 500 chars)
    let firstSection = "";
    const body = parsed?.body ?? content;
    const firstH2 = body.indexOf("\n## ");
    if (firstH2 !== -1) {
        const afterH2 = body.indexOf("\n", firstH2 + 1);
        const sectionStart = afterH2 !== -1 ? afterH2 + 1 : firstH2 + 4;
        const nextH2 = body.indexOf("\n## ", sectionStart);
        const sectionEnd = nextH2 !== -1 ? nextH2 : body.length;
        firstSection = body.slice(sectionStart, sectionEnd).trim().slice(0, 500);
    }
    const entry = {
        path: path.join(path.basename(stageDir), relativeName),
        mtime,
        frontmatter,
        firstSection,
    };
    // Decision kind detection
    if (stage === "decisions") {
        const baseName = path.basename(relativeName);
        if (/^\d{4}-\d{2}-\d{2}-/.test(baseName)) {
            entry.kind = "dated";
        }
        else if (/^ADR-\d{4}-/.test(baseName)) {
            entry.kind = "adr";
            const adrMatch = baseName.match(/^ADR-(\d{4})-/);
            if (adrMatch)
                entry.adrId = adrMatch[1];
        }
    }
    return entry;
}
// ---------------------------------------------------------------------------
// buildDossier — pure function
// ---------------------------------------------------------------------------
export function buildDossier(input) {
    const { topic, stageScan } = input;
    const stageLabels = [
        { name: "decisions", label: "Decide" },
        { name: "specs", label: "Spec" },
        { name: "plans", label: "Plan" },
        { name: "progress", label: "Build" },
        { name: "reviews", label: "Review" },
        { name: "findings", label: "Findings" },
        { name: "debug", label: "Debug" },
    ];
    let totalFiles = 0;
    let nonEmptyStages = 0;
    for (const stage of STAGE_NAMES) {
        const files = stageScan.stages[stage];
        if (files.length > 0) {
            nonEmptyStages++;
            totalFiles += files.length;
        }
    }
    // Build stage index table
    const tableRows = stageLabels.map(({ name, label }) => {
        const files = stageScan.stages[name];
        if (files.length === 0) {
            return `| ${label} | — | — | — |`;
        }
        const fileLinks = files
            .map((f) => {
            const rel = `../${f.path}`;
            const display = path.basename(f.path);
            return `[${display}](${rel})`;
        })
            .join("<br>");
        const status = extractStatus(files[0].frontmatter) ?? "(no status)";
        const latestMtime = files.reduce((latest, f) => (f.mtime > latest ? f.mtime : latest), "");
        const date = latestMtime ? latestMtime.slice(0, 10) : "—";
        return `| ${label} | ${fileLinks} | ${escapeTableCell(status)} | ${date} |`;
    });
    // Build summary bullets
    const summaryLines = [];
    for (const { name, label } of stageLabels) {
        const files = stageScan.stages[name];
        if (files.length === 0)
            continue;
        const status = extractStatus(files[0].frontmatter) ?? "unknown";
        const date = files[0].mtime ? files[0].mtime.slice(0, 10) : "—";
        const summary = files[0].firstSection ? truncate(files[0].firstSection, 150) : "";
        let line = `- **${label}** (${escapeTableCell(status)}, ${date})`;
        if (summary)
            line += `：${escapeTableCell(summary)}`;
        summaryLines.push(line);
    }
    // Build ADR section
    const adrFiles = stageScan.stages.decisions.filter((f) => f.kind === "adr");
    let adrSection = "";
    if (adrFiles.length > 0) {
        const adrLines = adrFiles.map((f) => {
            const title = f.frontmatter.title ?? topic;
            const id = f.adrId ?? "????";
            return `- [ADR-${id} ${escapeTableCell(String(title))}](../${f.path})`;
        });
        adrSection = `\n## 关联 ADR\n\n${adrLines.join("\n")}\n`;
    }
    // Assemble body
    let body = `# Feature: ${topic}\n\n`;
    body += `## 阶段索引\n\n`;
    body += `| 阶段 | 文件 | 状态 | 最近更新 |\n`;
    body += `|------|------|------|---------|\n`;
    body += `${tableRows.join("\n")}\n\n`;
    body += `## 摘要\n\n${summaryLines.join("\n")}\n`;
    body += adrSection;
    return {
        frontmatter: {
            topic,
            generated_at: "",
            auto_generated: true,
            stage_count: nonEmptyStages,
            total_files: totalFiles,
        },
        body,
    };
}
function extractStatus(fm) {
    if (typeof fm.status === "string")
        return fm.status;
    return null;
}
function escapeTableCell(s) {
    return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
function truncate(s, max) {
    if (s.length <= max)
        return s;
    return `${s.slice(0, max - 3)}...`;
}
// ---------------------------------------------------------------------------
// discoverTopics
// ---------------------------------------------------------------------------
export function discoverTopics(forgeRoot) {
    const topicSet = new Set();
    const emptySpecDirs = [];
    for (const stage of STAGE_NAMES) {
        const stageDir = path.join(forgeRoot, stage);
        let entries;
        try {
            entries = fs.readdirSync(stageDir);
        }
        catch {
            continue;
        }
        if (stage === "specs") {
            for (const entry of entries) {
                const entryPath = path.join(stageDir, entry);
                let stat;
                try {
                    stat = fs.statSync(entryPath);
                }
                catch {
                    continue;
                }
                if (!stat.isDirectory())
                    continue;
                const subFiles = fs.readdirSync(entryPath);
                if (subFiles.includes("spec.md")) {
                    topicSet.add(entry);
                }
                else {
                    topicSet.add(entry);
                    emptySpecDirs.push(entry);
                }
            }
            continue;
        }
        for (const file of entries) {
            if (!file.endsWith(".md"))
                continue;
            const rel = `${stage}/${file}`;
            const topic = deriveTopicFromPath(rel);
            if (topic)
                topicSet.add(topic);
        }
    }
    const topics = [...topicSet].sort();
    const drifts = detectDrifts(topics);
    return { topics, drifts, emptySpecDirs };
}
function detectDrifts(topics) {
    const drifts = [];
    for (let i = 0; i < topics.length; i++) {
        for (let j = i + 1; j < topics.length; j++) {
            const a = topics[i];
            const b = topics[j];
            const reason = classifyDrift(a, b);
            if (reason) {
                drifts.push({ topicA: a, topicB: b, reason });
            }
        }
    }
    return drifts;
}
function classifyDrift(a, b) {
    // trailing-digit: strip trailing digits/version suffixes
    const stripTrailing = (s) => s.replace(/[-.]?v?\d+$/, "");
    if (stripTrailing(a) === stripTrailing(b) && a !== b) {
        return "trailing-digit";
    }
    // plural-form: strip trailing 's'
    const stripPlural = (s) => s.replace(/s$/, "");
    if (stripPlural(a) === stripPlural(b) && a !== b) {
        return "plural-form";
    }
    // separator: replace _ with -
    if (a.replace(/_/g, "-") === b.replace(/_/g, "-") && a !== b) {
        return "separator";
    }
    // substring: one is strict prefix/suffix, length diff <= 5
    if (a !== b) {
        if ((b.startsWith(a) || a.startsWith(b)) && Math.abs(a.length - b.length) <= 5) {
            return "substring";
        }
    }
    return null;
}
//# sourceMappingURL=feature-dossier.js.map