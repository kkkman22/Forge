/**
 * Bounded Context registry loader.
 *
 * Loads context definition files (*.md with YAML frontmatter) from the Custom
 * layer and enabled packs, merging by name with priority: Custom > earlier
 * pack > later pack.
 */
import path from "node:path";
import { extractListField, parseFrontmatter } from "../frontmatter.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Parse a context .md file into a ContextEntry. */
function parseContextFile(content, sourcePath, layer) {
    const fm = parseFrontmatter(content);
    if (!fm)
        return null;
    const name = fm.raw.match(/^name:\s*(.+)$/m)?.[1]?.trim();
    if (!name)
        return null;
    const responsibility = fm.raw.match(/^responsibility:\s*(.+)$/m)?.[1]?.trim() ?? "";
    return {
        name,
        responsibility,
        aggregates: extractListField(fm.raw, "aggregates"),
        inboundEvents: extractListField(fm.raw, "inbound_events"),
        outboundEvents: extractListField(fm.raw, "outbound_events"),
        upstream: extractListField(fm.raw, "upstream"),
        downstream: extractListField(fm.raw, "downstream"),
        sourcePath,
        sourceLayer: layer,
        body: fm.body,
    };
}
/** Read *.md files from a directory, excluding _map.yaml. */
async function readContextFiles(dirPath, layer, fs) {
    const exists = await fs.exists(dirPath);
    if (!exists)
        return [];
    const stat = await fs.stat(dirPath);
    if (!stat.isDirectory())
        return [];
    const entries = await fs.readdir(dirPath);
    const mdFiles = entries.filter((f) => f.endsWith(".md"));
    const results = [];
    for (const file of mdFiles) {
        const filePath = path.join(dirPath, file);
        try {
            const content = await fs.readFile(filePath);
            const entry = parseContextFile(content, filePath, layer);
            if (entry)
                results.push(entry);
        }
        catch {
            // Skip unreadable files
        }
    }
    return results;
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Load and merge context definitions from all layers.
 *
 * Priority: Custom layer > first enabled pack > later packs.
 * For same-name contexts, the higher-priority layer wins.
 */
export async function loadContexts(enabledPacks, fs) {
    const contexts = new Map();
    // 1. Load pack contexts (later packs first so earlier packs overwrite)
    for (let i = enabledPacks.entries.length - 1; i >= 0; i--) {
        const pack = enabledPacks.entries[i];
        const contextsDir = pack.extends.contexts;
        if (!contextsDir)
            continue;
        const layer = `pack:${pack.name}`;
        const entries = await readContextFiles(contextsDir, layer, fs);
        for (const entry of entries) {
            contexts.set(entry.name, entry);
        }
    }
    // 2. Load custom layer contexts (highest priority, overwrites all)
    const customDir = path.join(enabledPacks.customLayerRoot, "contexts");
    const customEntries = await readContextFiles(customDir, "custom", fs);
    for (const entry of customEntries) {
        contexts.set(entry.name, entry);
    }
    return { contexts, map: [] };
}
//# sourceMappingURL=registry.js.map