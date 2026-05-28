import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
export class FrozenZoneViolation extends Error {
    paths;
    constructor(paths) {
        super(`FrozenZoneViolation: ${paths.join(", ")}`);
        this.paths = paths;
        this.name = "FrozenZoneViolation";
    }
}
// ---------------------------------------------------------------------------
// WorkflowAuditWriter
// ---------------------------------------------------------------------------
export class WorkflowAuditWriter {
    forgeRoot;
    frozenZoneChecker;
    hookCheckPath;
    constructor(forgeRoot, frozenZoneChecker, hookCheckPath) {
        this.forgeRoot = forgeRoot;
        this.frozenZoneChecker = frozenZoneChecker;
        this.hookCheckPath = hookCheckPath;
    }
    async write(target) {
        const destPath = this.resolveDestPath(target);
        // Frozen-zone pre-check
        if (this.frozenZoneChecker(destPath)) {
            throw new FrozenZoneViolation([destPath]);
        }
        // Hook check: call external frozen-zone hook script
        if (this.hookCheckPath && existsSync(this.hookCheckPath)) {
            try {
                execFileSync("bash", [this.hookCheckPath, destPath], {
                    stdio: "pipe",
                    timeout: 5000,
                });
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                throw new FrozenZoneViolation([destPath, `hook rejected: ${msg}`]);
            }
        }
        // mkdir -p
        const dir = dirname(destPath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        // Append-only write: read existing, append new content
        let existing = "";
        try {
            existing = readFileSync(destPath, "utf-8");
        }
        catch (err) {
            if (err.code !== "ENOENT")
                throw err;
        }
        const newSection = formatPayload(target);
        writeFileSync(destPath, existing + newSection, "utf-8");
    }
    resolveDestPath(target) {
        switch (target.subcommand) {
            case "review":
                return join(this.forgeRoot, "reviews", `${target.topic}.md`);
            case "decide":
                return join(this.forgeRoot, "decisions", `${isoDate()}-${slugify(target.topic)}.md`);
            case "learn":
                return join(this.forgeRoot, "knowledge", "sessions", `${target.runId}.md`);
        }
    }
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isoDate() {
    return new Date().toISOString().slice(0, 10);
}
function slugify(s) {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}
function formatPayload(target) {
    return `\n---\n# ${target.subcommand} (${target.runId})\n\n${JSON.stringify(target.payload, null, 2)}\n`;
}
//# sourceMappingURL=workflow-audit-writer.js.map