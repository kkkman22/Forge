import * as fs from "node:fs";
import * as path from "node:path";
// ---------------------------------------------------------------------------
// Minimal YAML parser
// Supports multiple arrays at root level, arrays of objects with sub-arrays.
//
// Handles YAML like:
//   key: value
//   array1:
//     - item1: v1
//       item2: v2
//       sub_array:
//         - "val1"
//         - "val2"
//   array2:
//     - plain_value
// ---------------------------------------------------------------------------
function stripQuotes(value) {
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
        return value.slice(1, -1);
    }
    return value;
}
function parseLine(rawLine) {
    const line = rawLine.replace(/\t/g, "  ").trimEnd();
    if (line.trim() === "" || line.trim().startsWith("#"))
        return null;
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trimStart();
    if (trimmed.startsWith("- ")) {
        return { indent, isDash: true, content: trimmed.slice(2).trim() };
    }
    if (trimmed === "-") {
        return { indent, isDash: true, content: "" };
    }
    return { indent, isDash: false, content: trimmed };
}
/**
 * Parse a simple YAML document into a flat-ish structure.
 * - Root-level `key: value` -> result[key] = string
 * - Root-level `key:` (no value) -> starts an array
 *   - `- plain` -> string items
 *   - `- k: v`  -> starts an object; subsequent indented `k: v` lines add to it
 *   - Object sub-properties that are `k:` (no value) start sub-arrays of strings
 */
function parseYaml(text) {
    const result = {};
    // Parse state
    let currentRootArrayKey = null;
    let rootArray = [];
    let currentObj = null;
    let subArrayKey = null;
    let subArray = [];
    function flushSubArray() {
        if (currentObj && subArrayKey !== null) {
            currentObj[subArrayKey] = [...subArray];
        }
        subArrayKey = null;
        subArray = [];
    }
    function flushObject() {
        flushSubArray();
        if (currentObj) {
            rootArray.push(currentObj);
        }
        currentObj = null;
    }
    function flushRootArray() {
        flushObject();
        if (currentRootArrayKey !== null) {
            result[currentRootArrayKey] = [...rootArray];
        }
        currentRootArrayKey = null;
        rootArray = [];
    }
    const lines = text.split("\n");
    for (const rawLine of lines) {
        const info = parseLine(rawLine);
        if (!info)
            continue;
        // ---------------------------------------------------------------
        // Root level (no active root array)
        // ---------------------------------------------------------------
        if (currentRootArrayKey === null) {
            if (info.isDash) {
                // Dash at root level — shouldn't happen, skip
                continue;
            }
            const kvMatch = info.content.match(/^([\w][\w_-]*):\s*(.*)$/);
            if (kvMatch) {
                const k = kvMatch[1];
                const v = kvMatch[2].trim();
                if (v === "") {
                    // Start a new root-level array
                    currentRootArrayKey = k;
                    rootArray = [];
                    currentObj = null;
                    subArrayKey = null;
                }
                else {
                    result[k] = stripQuotes(v);
                }
            }
            continue;
        }
        // ---------------------------------------------------------------
        // Inside a root-level array
        // ---------------------------------------------------------------
        // A dash line
        if (info.isDash) {
            // Is this a sub-array item (indented deeper than the array item level)?
            if (subArrayKey !== null && currentObj !== null) {
                subArray.push(stripQuotes(info.content));
                continue;
            }
            // Otherwise, this starts a new object (or plain string) in the root array
            flushObject();
            currentObj = {};
            // Content may be "key: value" or plain string
            const kvMatch = info.content.match(/^([\w][\w_-]*):\s*(.*)$/);
            if (kvMatch) {
                const k = kvMatch[1];
                const v = kvMatch[2].trim();
                currentObj[k] = v === "" ? [] : stripQuotes(v);
            }
            else if (info.content) {
                // Plain string item
                rootArray.push(stripQuotes(info.content));
                currentObj = null;
            }
            continue;
        }
        // Non-dash line (at root array level — means it's a new root key, or
        // continuation inside currentObj)
        if (info.indent === 0 && !info.isDash) {
            // This is a new root-level key: close the current root array
            flushRootArray();
            const kvMatch = info.content.match(/^([\w][\w_-]*):\s*(.*)$/);
            if (kvMatch) {
                const k = kvMatch[1];
                const v = kvMatch[2].trim();
                if (v === "") {
                    currentRootArrayKey = k;
                    rootArray = [];
                    currentObj = null;
                    subArrayKey = null;
                }
                else {
                    result[k] = stripQuotes(v);
                }
            }
            continue;
        }
        // Indented non-dash line inside currentObj
        if (currentObj !== null) {
            const kvMatch = info.content.match(/^([\w][\w_-]*):\s*(.*)$/);
            if (kvMatch) {
                const k = kvMatch[1];
                const v = kvMatch[2].trim();
                // Flush any pending sub-array before setting a new property
                flushSubArray();
                if (v === "") {
                    // Starts a sub-array
                    subArrayKey = k;
                    subArray = [];
                }
                else {
                    currentObj[k] = stripQuotes(v);
                }
            }
        }
    }
    // Flush remaining state
    flushRootArray();
    return result;
}
// ---------------------------------------------------------------------------
// Load pack lint rules
// ---------------------------------------------------------------------------
export function loadPackLintRules(packRootPath, manifestRelativePath) {
    const manifestPath = path.join(packRootPath, manifestRelativePath);
    if (!fs.existsSync(manifestPath)) {
        return [];
    }
    const manifestText = fs.readFileSync(manifestPath, "utf-8");
    const parsed = parseYaml(manifestText);
    const rulesRaw = parsed.rules;
    if (!Array.isArray(rulesRaw)) {
        return [];
    }
    const packName = path.basename(packRootPath);
    const rules = [];
    for (const entry of rulesRaw) {
        const ruleEntry = entry;
        const id = ruleEntry.id;
        const severity = ruleEntry.severity;
        const entryRelPath = ruleEntry.entry;
        const description = ruleEntry.description;
        const target_globs = ruleEntry.target_globs;
        const ruleFilePath = path.join(packRootPath, path.dirname(manifestRelativePath), entryRelPath);
        if (!fs.existsSync(ruleFilePath)) {
            continue;
        }
        const ruleText = fs.readFileSync(ruleFilePath, "utf-8");
        const ruleParsed = parseYaml(ruleText);
        const patterns = parsePatterns(ruleParsed.patterns);
        rules.push({
            id,
            severity,
            description,
            target_globs,
            patterns,
            sourcePack: packName,
            entryPath: entryRelPath,
        });
    }
    return rules;
}
function parsePatterns(raw) {
    if (!Array.isArray(raw))
        return [];
    const patterns = [];
    for (const item of raw) {
        const obj = item;
        if (obj.type === "regex") {
            patterns.push({
                type: "regex",
                expression: obj.expression,
                message: obj.message,
                fix_suggestion: obj.fix_suggestion,
            });
        }
    }
    return patterns;
}
// ---------------------------------------------------------------------------
// Apply lint rules to file
// ---------------------------------------------------------------------------
/** Escape hatch pattern: // @forge:allow-<anything> */
const ESCAPE_HATCH_RE = /\/\/\s*@forge:allow-/;
export function applyLintRulesToFile(filePath, fileContent, rules) {
    const findings = [];
    const lines = fileContent.split("\n");
    for (const rule of rules) {
        if (!matchesGlobs(filePath, rule.target_globs)) {
            continue;
        }
        const severity = rule.severity === "error" ? "error" : "warning";
        for (const pattern of rule.patterns) {
            if (pattern.type !== "regex")
                continue;
            if (!isSafeRegex(pattern.expression))
                continue;
            let regex;
            try {
                regex = new RegExp(pattern.expression);
            }
            catch {
                continue;
            }
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                // Skip lines with escape hatch
                if (ESCAPE_HATCH_RE.test(line)) {
                    continue;
                }
                if (regex.test(line)) {
                    findings.push({
                        ruleId: rule.id,
                        severity,
                        file: filePath,
                        line: i + 1, // 1-based line numbers
                        message: pattern.message,
                    });
                }
            }
        }
    }
    return findings;
}
// ---------------------------------------------------------------------------
// Glob matching (simple implementation)
// ---------------------------------------------------------------------------
/**
 * Simple glob matching: checks if filePath is consistent with any of the
 * provided glob patterns. Supports ** (any directory depth) and * (any segment).
 */
function matchesGlobs(filePath, globs) {
    return globs.some((glob) => matchesGlob(filePath, glob));
}
function matchesGlob(filePath, glob) {
    // Normalize separators
    const normFile = filePath.replace(/\\/g, "/");
    const normGlob = glob.replace(/\\/g, "/");
    // Convert glob to regex
    const regexStr = globToRegex(normGlob);
    try {
        const re = new RegExp(`^${regexStr}$`);
        return re.test(normFile);
    }
    catch {
        return false;
    }
}
function globToRegex(glob) {
    // Escape regex special chars, then restore glob wildcards
    let s = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    // **/ matches any directory depth (including zero)
    s = s.replace(/\*\*\//g, "(?:.*/)?");
    // ** matches any path segments
    s = s.replace(/\*\*/g, ".*");
    // * matches any segment (no slash)
    s = s.replace(/\*/g, "[^/]*");
    return s;
}
/** Max regex pattern length to prevent ReDoS. */
const MAX_REGEX_LENGTH = 500;
/**
 * Detect quantified groups with nested quantifiers: e.g. `(?:...)+\s*\1+`
 * which cause catastrophic backtracking. Simple quantifiers like `\s*` are fine.
 */
const DANGEROUS_NESTED_QUANTIFIER_RE = /\((?:\?:|)[^)]*[+*{][^)]*\)[+*{]/;
function isSafeRegex(pattern) {
    if (pattern.length > MAX_REGEX_LENGTH)
        return false;
    if (DANGEROUS_NESTED_QUANTIFIER_RE.test(pattern))
        return false;
    return true;
}
//# sourceMappingURL=pack-rules.js.map