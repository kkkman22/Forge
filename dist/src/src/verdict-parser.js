/**
 * Verdict parser for Forge_Verify Three-State Verdict.
 *
 * Parses `verdict.md` content into a structured `ParsedVerdict`.
 * Total function: any string input produces a valid result with
 * verdict ∈ {"VERIFIED", "NOT_VERIFIED", "INCONCLUSIVE"}.
 *
 * **Validates: Requirements R1.9, R13.3**
 */
const VALID_VERDICTS = new Set([
    "VERIFIED",
    "NOT_VERIFIED",
    "INCONCLUSIVE",
]);
/**
 * Parse a verdict.md content string into a structured ParsedVerdict.
 *
 * This is a total function: any input (including empty, corrupted, or
 * garbage strings) produces a result with verdict ∈ {VERIFIED, NOT_VERIFIED, INCONCLUSIVE}.
 * Unparseable or invalid inputs default to INCONCLUSIVE.
 */
export function parseVerdict(content) {
    if (!content || typeof content !== "string") {
        return inconclusive(content, [], "empty or non-string input");
    }
    const frontmatter = extractFrontmatter(content);
    if (!frontmatter) {
        return inconclusive(content, [], "no YAML frontmatter found");
    }
    const verdictRaw = frontmatter.verdict;
    if (typeof verdictRaw !== "string") {
        return inconclusive(content, [], "verdict field is not a string");
    }
    const verdict = normalizeVerdict(verdictRaw);
    const topic = typeof frontmatter.topic === "string" ? frontmatter.topic : "";
    const missingArtifacts = parseStringArray(frontmatter.missing_artifacts);
    const inconclusiveReason = typeof frontmatter.inconclusive_reason === "string" ? frontmatter.inconclusive_reason : null;
    return {
        verdict,
        topic,
        missingArtifacts,
        inconclusiveReason,
        raw: content,
    };
}
function inconclusive(raw, missingArtifacts, reason) {
    return {
        verdict: "INCONCLUSIVE",
        topic: "",
        missingArtifacts,
        inconclusiveReason: reason,
        raw,
    };
}
function extractFrontmatter(content) {
    const trimmed = content.trim();
    if (!trimmed.startsWith("---"))
        return null;
    const endIdx = trimmed.indexOf("---", 3);
    if (endIdx === -1)
        return null;
    const yamlStr = trimmed.slice(3, endIdx).trim();
    if (!yamlStr)
        return null;
    return parseSimpleYaml(yamlStr);
}
function parseSimpleYaml(yaml) {
    const result = {};
    const lines = yaml.split("\n");
    for (const line of lines) {
        const colonIdx = line.indexOf(":");
        if (colonIdx === -1)
            continue;
        const key = line.slice(0, colonIdx).trim();
        const valueStr = line.slice(colonIdx + 1).trim();
        result[key] = parseYamlValue(valueStr);
    }
    return Object.keys(result).length > 0 ? result : null;
}
function parseYamlValue(value) {
    if (value === "" || value === "null" || value === "~")
        return null;
    if (value === "true")
        return true;
    if (value === "false")
        return false;
    if (value.startsWith('"') && value.endsWith('"')) {
        return value.slice(1, -1);
    }
    if (value.startsWith("'") && value.endsWith("'")) {
        return value.slice(1, -1);
    }
    if (value.startsWith("[") && value.endsWith("]")) {
        try {
            return JSON.parse(value.replace(/'/g, '"'));
        }
        catch {
            return value;
        }
    }
    return value;
}
function normalizeVerdict(raw) {
    const trimmed = raw.trim().toUpperCase();
    if (VALID_VERDICTS.has(trimmed))
        return trimmed;
    return "INCONCLUSIVE";
}
function parseStringArray(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter((v) => typeof v === "string");
}
//# sourceMappingURL=verdict-parser.js.map