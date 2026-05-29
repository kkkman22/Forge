import fs from "node:fs";
const VALID_PRIORITIES = new Set(["P0", "P1", "P2", "P3"]);
const VALID_LINE_TYPES = new Set(["ADDED", "REMOVED", "CONTEXT"]);
const VALID_SOURCE_LAYERS = new Set(["spec-check", "quality-check", "security-check"]);
const SAFE_FILE_PATH_RE = /^[A-Za-z0-9._/-]+$/;
export class ReviewMarkdownNotFoundError extends Error {
    filePath;
    constructor(filePath) {
        super(`Review markdown not found: ${filePath}`);
        this.filePath = filePath;
        this.name = "ReviewMarkdownNotFoundError";
    }
}
export class ReviewMarkdownParseError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "ReviewMarkdownParseError";
    }
}
export async function parseReviewMarkdown(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new ReviewMarkdownNotFoundError(filePath);
    }
    const content = fs.readFileSync(filePath, "utf8");
    const findingsBlockMatch = content.match(/```findings\n([\s\S]*?)```/);
    if (!findingsBlockMatch) {
        throw new ReviewMarkdownParseError("no-findings-block", "No ```findings block found in review markdown");
    }
    let raw;
    try {
        // Minimal YAML-like parsing for the findings list
        raw = parseFindingsYaml(findingsBlockMatch[1]);
    }
    catch {
        throw new ReviewMarkdownParseError("yaml-parse-error", "Failed to parse findings YAML block");
    }
    return raw.map((item, i) => {
        const r = item;
        if (!r.priority || !VALID_PRIORITIES.has(r.priority)) {
            throw new ReviewMarkdownParseError("invalid-priority", `Finding ${i}: invalid priority "${r.priority}"`);
        }
        if (!r.finding_type || typeof r.finding_type !== "string") {
            throw new ReviewMarkdownParseError("invalid-finding-type", `Finding ${i}: missing finding_type`);
        }
        if (!r.file_path || typeof r.file_path !== "string") {
            throw new ReviewMarkdownParseError("invalid-file-path", `Finding ${i}: missing file_path`);
        }
        if (!SAFE_FILE_PATH_RE.test(r.file_path)) {
            throw new ReviewMarkdownParseError("invalid-file-path", `Finding ${i}: file_path contains unsafe characters`);
        }
        if (typeof r.line_number !== "number") {
            throw new ReviewMarkdownParseError("invalid-line-number", `Finding ${i}: missing line_number`);
        }
        if (!r.line_type || !VALID_LINE_TYPES.has(r.line_type)) {
            throw new ReviewMarkdownParseError("invalid-line-type", `Finding ${i}: invalid line_type "${r.line_type}"`);
        }
        if (!r.message || typeof r.message !== "string") {
            throw new ReviewMarkdownParseError("invalid-message", `Finding ${i}: missing message`);
        }
        if (!r.source_layer || !VALID_SOURCE_LAYERS.has(r.source_layer)) {
            throw new ReviewMarkdownParseError("invalid-source-layer", `Finding ${i}: invalid source_layer "${r.source_layer}"`);
        }
        const finding = {
            priority: r.priority,
            finding_type: r.finding_type,
            file_path: r.file_path,
            line_number: r.line_number,
            line_type: r.line_type,
            message: r.message,
            source_layer: r.source_layer,
        };
        if (r.suggestion !== undefined && r.suggestion !== null) {
            finding.suggestion = String(r.suggestion);
        }
        if (r.suggestion_end_line !== undefined && r.suggestion_end_line !== null) {
            finding.suggestion_end_line = Number(r.suggestion_end_line);
        }
        return finding;
    });
}
function parseFindingsYaml(yaml) {
    const results = [];
    let current = null;
    for (const line of yaml.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        const listMatch = trimmed.match(/^- (.+)/);
        if (listMatch) {
            if (current)
                results.push(current);
            current = {};
            const kv = parseKeyValue(listMatch[1]);
            if (kv)
                current[kv[0]] = kv[1];
            continue;
        }
        const kv = parseKeyValue(trimmed);
        if (kv && current) {
            current[kv[0]] = kv[1];
        }
    }
    if (current)
        results.push(current);
    return results;
}
function parseKeyValue(s) {
    const colonIdx = s.indexOf(":");
    if (colonIdx === -1)
        return null;
    const key = s.slice(0, colonIdx).trim();
    let val = s.slice(colonIdx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
    }
    else if (val === "true") {
        val = true;
    }
    else if (val === "false") {
        val = false;
    }
    else if (/^-?\d+$/.test(val)) {
        val = Number(val);
    }
    return [key, val];
}
//# sourceMappingURL=parse-review.js.map