import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
/**
 * Parse YAML frontmatter from a review progress file.
 * Returns the parsed frontmatter object, or {} on error (R15.7).
 */
export function parseReviewFrontmatter(filePath) {
    try {
        const content = readFileSync(filePath, "utf-8");
        const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (!match)
            return {};
        const fm = parseYaml(match[1]) ?? {};
        if (fm.layers_status === undefined || fm.layers_status === null) {
            fm.layers_status = {};
        }
        return fm;
    }
    catch {
        return {};
    }
}
/**
 * Check if a review is complete: all layers done + completed_at is set.
 */
export function isReviewComplete(fm) {
    if (!fm.completed_at)
        return false;
    if (!fm.layers_status || typeof fm.layers_status !== "object")
        return false;
    const layers = Object.values(fm.layers_status);
    return layers.length > 0 && layers.every((s) => s === "done");
}
//# sourceMappingURL=reviews.mjs.map