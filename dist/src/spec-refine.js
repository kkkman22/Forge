/**
 * Auto Refine detection and execution.
 *
 * detectSpecTriggers: checks mtime and file existence for migration/refine needs.
 * refineDownstream: resets downstream file status based on upstream changes.
 *
 * Validates: Requirements 5, 8
 */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
// ---------------------------------------------------------------------------
// detectSpecTriggers
// ---------------------------------------------------------------------------
export function detectSpecTriggers(featureDir, options) {
    const reqPath = join(featureDir, "requirements.md");
    const designPath = join(featureDir, "design.md");
    const tasksPath = join(featureDir, "tasks.md");
    const specPath = join(featureDir, "spec.md");
    const hasThreeFile = existsSync(reqPath);
    const hasLegacy = existsSync(specPath);
    const hasTasks = existsSync(tasksPath);
    let migrationNeeded = false;
    // Migration needed: legacy spec.md without three files
    if (hasLegacy && !hasThreeFile) {
        migrationNeeded = true;
    }
    // Migration needed: plans file without tasks.md
    if (options?.hasPlansFile && !hasTasks) {
        migrationNeeded = true;
    }
    // Refine detection: check mtime ordering
    let refineTarget;
    if (hasThreeFile && existsSync(designPath)) {
        // Check if requirements is locked and newer than design
        const reqContent = readFrontmatterStatus(reqPath);
        const designContent = readFrontmatterStatus(designPath);
        if (reqContent === "locked" && designContent === "locked") {
            const reqMtime = statSync(reqPath).mtimeMs;
            const designMtime = statSync(designPath).mtimeMs;
            if (reqMtime > designMtime) {
                refineTarget = "design";
            }
        }
    }
    if (hasThreeFile && existsSync(designPath) && existsSync(tasksPath) && !refineTarget) {
        const designMtime = statSync(designPath).mtimeMs;
        const tasksMtime = statSync(tasksPath).mtimeMs;
        const designStatus = readFrontmatterStatus(designPath);
        const tasksStatus = readFrontmatterStatus(tasksPath);
        if (designStatus === "locked" && tasksStatus === "locked" && designMtime > tasksMtime) {
            refineTarget = "tasks";
        }
    }
    return { migrationNeeded, refineTarget };
}
// ---------------------------------------------------------------------------
// refineDownstream
// ---------------------------------------------------------------------------
export function refineDownstream(bundle, target, options) {
    const hasSnapshot = options?.hasSnapshot ?? true;
    const eventsPath = options?.eventsPath;
    if (target === "design") {
        return {
            ...bundle,
            design: undefined,
            tasks: undefined,
        };
    }
    if (target === "tasks") {
        if (!hasSnapshot) {
            if (eventsPath) {
                import("./event-writer.js").then(({ writeEvent }) => {
                    writeEvent(eventsPath, "refine_fallback_to_full_regen", { target });
                });
            }
            return {
                ...bundle,
                design: undefined,
                tasks: undefined,
            };
        }
        return {
            ...bundle,
            tasks: undefined,
        };
    }
    return bundle;
}
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function readFrontmatterStatus(filePath) {
    try {
        const { readFileSync } = require("node:fs");
        const content = readFileSync(filePath, "utf-8");
        const match = content.match(/^---\n[\s\S]*?status:\s*(\w+)/);
        return match?.[1];
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=spec-refine.js.map