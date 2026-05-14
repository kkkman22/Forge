/**
 * Atomic rule loader for the `rules/` directory.
 *
 * Reads `rules/*.md` files, parses their frontmatter, and provides
 * helper for rendering suggestion suffix with lint_binding info.
 *
 * **Validates: Requirement R3.6**
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
/**
 * Load all atomic rules from the `rules/` directory.
 *
 * Files with missing frontmatter fields are skipped with a warning
 * (no throw) [R3.8].
 */
export async function loadAllRules(rulesDir) {
    const dir = rulesDir ?? join(process.cwd(), "rules");
    if (!existsSync(dir))
        return [];
    const rules = [];
    let entries;
    try {
        entries = readdirSync(dir).filter((f) => f.endsWith(".md"));
    }
    catch {
        return [];
    }
    for (const entry of entries) {
        const filePath = join(dir, entry);
        const raw = readFileSync(filePath, "utf-8");
        const parsed = parseRuleFrontmatter(raw, filePath);
        if (parsed) {
            rules.push(parsed);
        }
    }
    return rules;
}
/**
 * Render a suggestion suffix referencing the lint rule binding.
 *
 * Returns empty string if the rule has no lint_binding.
 */
export function renderSuggestionSuffix(rule) {
    if (!rule.lintBinding)
        return "";
    if (typeof rule.lintBinding === "string") {
        return ` (lint: ${rule.lintBinding})`;
    }
    const parts = [];
    if (rule.lintBinding.biome)
        parts.push(`biome: ${rule.lintBinding.biome}`);
    if (rule.lintBinding.eslint)
        parts.push(`eslint: ${rule.lintBinding.eslint}`);
    return parts.length > 0 ? ` (lint: ${parts.join(", ")})` : "";
}
function parseRuleFrontmatter(raw, filePath) {
    const frontmatter = extractFrontmatter(raw);
    if (!frontmatter) {
        return null;
    }
    const name = frontmatter.name;
    if (typeof name !== "string" || !name.trim()) {
        return null;
    }
    const alwaysApply = frontmatter.alwaysApply === true;
    const lintBinding = parseLintBinding(frontmatter.lint_binding);
    return { name, alwaysApply, lintBinding, raw, filePath };
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
    let currentKey = null;
    let nestedLines = [];
    for (const line of lines) {
        const colonIdx = line.indexOf(":");
        if (line.startsWith("  ") && currentKey) {
            // Nested line — collect for nested object parsing
            nestedLines.push(line.trim());
            continue;
        }
        // Flush previous nested object
        if (currentKey && nestedLines.length > 0) {
            const nested = {};
            for (const nl of nestedLines) {
                const nc = nl.indexOf(":");
                if (nc !== -1) {
                    const nk = nl.slice(0, nc).trim();
                    const nv = nl.slice(nc + 1).trim();
                    nested[nk] = parseYamlValue(nv);
                }
            }
            result[currentKey] = nested;
            nestedLines = [];
        }
        if (colonIdx === -1) {
            currentKey = null;
            continue;
        }
        const key = line.slice(0, colonIdx).trim();
        const valueStr = line.slice(colonIdx + 1).trim();
        if (valueStr === "" || valueStr === "null" || valueStr === "~") {
            // Key with no inline value — might be a nested object
            currentKey = key;
            nestedLines = [];
        }
        else {
            result[key] = parseYamlValue(valueStr);
            currentKey = null;
        }
    }
    // Flush final nested object
    if (currentKey && nestedLines.length > 0) {
        const nested = {};
        for (const nl of nestedLines) {
            const nc = nl.indexOf(":");
            if (nc !== -1) {
                const nk = nl.slice(0, nc).trim();
                const nv = nl.slice(nc + 1).trim();
                nested[nk] = parseYamlValue(nv);
            }
        }
        result[currentKey] = nested;
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
    return value;
}
function parseLintBinding(value) {
    if (value === null || value === undefined)
        return null;
    if (typeof value === "string")
        return value;
    if (typeof value === "object" && value !== null) {
        const obj = value;
        if (typeof obj.biome === "string" || typeof obj.eslint === "string") {
            return {
                biome: typeof obj.biome === "string" ? obj.biome : "",
                eslint: typeof obj.eslint === "string" ? obj.eslint : "",
            };
        }
    }
    return null;
}
//# sourceMappingURL=rules-loader.js.map