import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
const configPath = join(process.cwd(), "templates", "cmux.json");
const LEGACY_PANE_TYPES = new Set(["Mirror_Pane", "Progress_Pane", "Loop_State"]);
function parseConfig() {
    return JSON.parse(readFileSync(configPath, "utf-8"));
}
function isSplitNode(n) {
    return n !== null && typeof n === "object" && "children" in n;
}
function isPaneNode(n) {
    return n !== null && typeof n === "object" && "pane" in n;
}
/** Walk the layout tree, collecting every schema violation. */
function layoutViolations(node, path, out) {
    if (isSplitNode(node)) {
        const dir = node.direction;
        if (dir !== "horizontal" && dir !== "vertical") {
            out.push(`${path}.direction must be horizontal|vertical, got ${JSON.stringify(dir)}`);
        }
        const sp = node.split;
        if (typeof sp !== "number" || sp < 0.1 || sp > 0.9) {
            out.push(`${path}.split must be a number in [0.1,0.9], got ${JSON.stringify(sp)}`);
        }
        const kids = node.children ?? [];
        if (kids.length !== 2) {
            out.push(`${path}.children must have exactly 2 nodes, got ${kids.length}`);
        }
        kids.forEach((k, i) => layoutViolations(k, `${path}.children[${i}]`, out));
        return;
    }
    if (isPaneNode(node)) {
        const surfaces = node.pane?.surfaces;
        if (!Array.isArray(surfaces) || surfaces.length === 0) {
            out.push(`${path}.pane.surfaces must be a non-empty array`);
            return;
        }
        surfaces.forEach((s, i) => {
            if (s.type !== "terminal" && s.type !== "browser") {
                out.push(`${path}.pane.surfaces[${i}].type must be terminal|browser, got ${JSON.stringify(s.type)}`);
            }
        });
        return;
    }
    out.push(`${path} is neither a split node (children) nor a pane node (pane.surfaces)`);
}
/** Flatten all surfaces reachable from a layout tree. */
function collectSurfaces(node, out = []) {
    if (isSplitNode(node)) {
        (node.children ?? []).forEach((c) => collectSurfaces(c, out));
    }
    else if (isPaneNode(node)) {
        out.push(...(node.pane?.surfaces ?? []));
    }
    return out;
}
// Resolved once at module load; cmux is macOS-native so CI (headless) lacks it.
const HAS_CMUX = (() => {
    try {
        execFileSync("cmux", ["--version"], { stdio: "ignore", timeout: 2000 });
        return true;
    }
    catch {
        return false;
    }
})();
// The doctor test is always registered as a normal `it` (NOT `it.skip`) so that
// `vitest list` counts it identically in CI and locally — README test metrics
// are calibrated to `vitest list`, which excludes `.skip` tests. Using
// `it.skip` when cmux is absent made the count environment-dependent (7445 in
// headless CI vs 7446 locally with cmux) and broke check-readme-metrics. The
// test no-ops internally when cmux is absent instead.
describe("templates/cmux.json — real cmux schema conformance", () => {
    it("is valid JSON with schemaVersion 1", () => {
        const config = parseConfig();
        expect(config.schemaVersion).toBe(1);
    });
    it("has NO legacy top-level `layouts` key (the prior drift)", () => {
        const config = parseConfig();
        expect(config).not.toHaveProperty("layouts");
    });
    it("declares commands as a non-empty array", () => {
        const config = parseConfig();
        expect(Array.isArray(config.commands)).toBe(true);
        expect((config.commands ?? []).length).toBeGreaterThan(0);
    });
    it("defines the three R9.2 Forge workspace commands by name", () => {
        const config = parseConfig();
        const names = (config.commands ?? []).map((c) => c.name);
        expect(names).toEqual(expect.arrayContaining(["Forge Workflow", "Forge Loop Monitor", "Forge Dev"]));
    });
    it("every Forge command is a valid workspace layout command (no label/action drift)", () => {
        const config = parseConfig();
        const forge = (config.commands ?? []).filter((c) => ["Forge Workflow", "Forge Loop Monitor", "Forge Dev"].includes(c.name));
        expect(forge.length).toBe(3);
        for (const cmd of forge) {
            expect(cmd).not.toHaveProperty("label"); // legacy drift field
            expect(cmd).not.toHaveProperty("action"); // legacy drift field
            expect(typeof cmd.workspace).toBe("object");
            expect(cmd.workspace).not.toBeUndefined();
        }
    });
    it("every Forge layout tree conforms to the cmux split/pane schema", () => {
        const config = parseConfig();
        const forge = (config.commands ?? []).filter((c) => ["Forge Workflow", "Forge Loop Monitor", "Forge Dev"].includes(c.name));
        const violations = [];
        for (const cmd of forge) {
            const layout = cmd.workspace?.layout;
            if (layout === undefined) {
                violations.push(`${cmd.name}: missing workspace.layout`);
                continue;
            }
            layoutViolations(layout, `${cmd.name}.layout`, violations);
        }
        expect(violations).toEqual([]);
    });
    it("uses only terminal|browser surfaces (no Mirror_Pane/Progress_Pane/Loop_State)", () => {
        const config = parseConfig();
        const raw = JSON.stringify(config);
        for (const legacy of LEGACY_PANE_TYPES) {
            expect(raw).not.toContain(`"type": "${legacy}"`);
            expect(raw).not.toContain(`"${legacy}"`);
        }
    });
    it("each Forge layout runs the Mirror_Daemon (R9.2 mirror pane intent)", () => {
        const config = parseConfig();
        const forge = (config.commands ?? []).filter((c) => ["Forge Workflow", "Forge Loop Monitor", "Forge Dev"].includes(c.name));
        for (const cmd of forge) {
            const surfaces = collectSurfaces(cmd.workspace.layout);
            const hasMirror = surfaces.some((s) => typeof s.command === "string" && s.command.includes("mirror.mjs"));
            expect(hasMirror, `${cmd.name}: no terminal runs scripts/cmux-mirror/mirror.mjs`).toBe(true);
        }
    });
    it("at least one layout surfaces a Claude Code terminal (R9.3 intent)", () => {
        const config = parseConfig();
        const allSurfaces = (config.commands ?? []).flatMap((c) => collectSurfaces(c.workspace?.layout) ?? []);
        const hasClaude = allSurfaces.some((s) => typeof s.command === "string" && /\bclaude\b/.test(s.command));
        expect(hasClaude).toBe(true);
    });
    it("preserves agent_resume_approvals (cmux 0.64.10 feature)", () => {
        const config = parseConfig();
        expect(Array.isArray(config.agent_resume_approvals)).toBe(true);
        const approvals = config.agent_resume_approvals;
        expect((approvals ?? []).length).toBeGreaterThan(0);
    });
    it("passes `cmux config doctor --path` when cmux is installed (R9.9)", () => {
        if (!HAS_CMUX)
            return; // cmux is macOS-native; CI (headless Linux) lacks it
        const result = execFileSync("cmux", ["config", "doctor", "--path", configPath], {
            encoding: "utf-8",
            timeout: 5000,
        });
        // doctor prints "JSONC syntax is valid" on success; a syntax error would
        // print a diagnostic and exit non-zero (caught by execFileSync throwing).
        expect(result).toContain("valid");
    });
});
//# sourceMappingURL=cmux-json-schema.test.js.map