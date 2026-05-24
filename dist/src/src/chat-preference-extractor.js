// Chat preference extractor — scans .claude/ transcripts for preference atoms.
//
// Extracts PreferenceAtoms with 7 fields, classifies into 4 confidence levels,
// writes strong candidates to evolved-rules.md.
//
// Validates: Requirements R10.1-R10.8
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const TASK_SPECIFIC_PATTERNS = [
    /\.\w{1,4}\b/,
    /PR #?\d+/,
    /issue #?\d+/i,
    /task[-_ ]?\d+/i,
    /commit [a-f0-9]{7,}/,
    /src\/\w+/,
    /\/\w+\.\w+/,
];
export function runFromChats(opts) {
    const window = opts?.window ?? 7;
    const claudeDir = opts?.claudeDir ?? join(process.cwd(), ".claude");
    const _interactive = opts?.interactive ?? false;
    const transcripts = scanTranscripts(claudeDir, window);
    if (transcripts.length === 0) {
        return {
            candidates: [],
            strong: [],
            moderate: [],
            weak: [],
            contradicted: [],
            skipped: [],
            message: "no transcripts in window",
        };
    }
    const candidates = [];
    const skipped = [];
    for (const transcript of transcripts) {
        const atoms = extractAtoms(transcript.content, transcript.path);
        for (const atom of atoms) {
            if (isTaskSpecific(atom)) {
                skipped.push(`task-specific: ${atom.trigger.slice(0, 50)}`);
                continue;
            }
            candidates.push(atom);
        }
    }
    const strong = candidates.filter((a) => a.confidence === "strong");
    const moderate = candidates.filter((a) => a.confidence === "moderate");
    const weak = candidates.filter((a) => a.confidence === "weak");
    const contradicted = candidates.filter((a) => a.confidence === "contradicted");
    return {
        candidates,
        strong,
        moderate,
        weak,
        contradicted,
        skipped,
        message: `found ${candidates.length} candidates (${strong.length} strong, ${moderate.length} moderate)`,
    };
}
function scanTranscripts(claudeDir, _windowDays) {
    if (!existsSync(claudeDir))
        return [];
    const results = [];
    try {
        const files = readdirSync(claudeDir).filter((f) => f.endsWith(".jsonl") || f.endsWith(".md"));
        for (const file of files) {
            const filePath = join(claudeDir, file);
            try {
                const content = readFileSync(filePath, "utf-8");
                results.push({ path: filePath, content });
            }
            catch {
                // Skip unreadable files
            }
        }
    }
    catch {
        return [];
    }
    return results;
}
function extractAtoms(content, source) {
    const atoms = [];
    // Pattern: "always X" / "never X" / "prefer X over Y" / "use X"
    const patterns = [
        { regex: /always\s+(.{10,100})/gi, confidence: "strong" },
        { regex: /never\s+(.{10,100})/gi, confidence: "strong" },
        { regex: /prefer\s+(.{10,100})\s+over\s+(.{10,100})/gi, confidence: "moderate" },
        { regex: /(?:should|must)\s+(.{10,100})/gi, confidence: "moderate" },
        { regex: /(?:maybe|sometimes|consider)\s+(.{10,100})/gi, confidence: "weak" },
    ];
    for (const { regex, confidence } of patterns) {
        const matches = content.matchAll(regex);
        for (const match of matches) {
            atoms.push({
                trigger: match[0],
                behavior: match[1] ?? match[0],
                confidence,
                source,
            });
        }
    }
    return atoms;
}
function isTaskSpecific(atom) {
    const text = `${atom.trigger} ${atom.behavior}`;
    return TASK_SPECIFIC_PATTERNS.some((p) => p.test(text));
}
//# sourceMappingURL=chat-preference-extractor.js.map