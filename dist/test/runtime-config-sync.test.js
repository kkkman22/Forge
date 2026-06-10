import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectRuntimeConfigDrift, repairRuntimeConfig } from "../src/runtime-config-sync.js";
describe("runtime-config-sync", () => {
    let root;
    let settingsPath;
    beforeEach(() => {
        root = join(tmpdir(), `forge-runtime-sync-${Date.now()}`);
        settingsPath = join(root, ".claude", "settings.json");
        mkdirSync(join(root, ".claude"), { recursive: true });
    });
    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });
    it("detects missing required Forge runtime hooks in source mode", () => {
        writeFileSync(settingsPath, JSON.stringify({ hooks: { SessionStart: [] } }, null, 2));
        const report = detectRuntimeConfigDrift({
            projectRoot: root,
            mode: "source",
        });
        expect(report.mode).toBe("source");
        expect(report.drift).toBe(true);
        expect(report.missingHookEvents).toEqual(expect.arrayContaining(["PreCompact", "PostCompact", "UserPromptSubmit", "Stop"]));
    });
    it("repairs source mode hooks without deleting user hooks", () => {
        writeFileSync(settingsPath, JSON.stringify({
            hooks: {
                SessionStart: [
                    {
                        hooks: [{ type: "command", command: "echo user hook" }],
                    },
                ],
            },
        }, null, 2));
        const first = repairRuntimeConfig({
            projectRoot: root,
            mode: "source",
        });
        const second = repairRuntimeConfig({
            projectRoot: root,
            mode: "source",
        });
        expect(first.changed).toBe(true);
        expect(second.changed).toBe(false);
        const parsed = JSON.parse(readFileSync(settingsPath, "utf-8"));
        expect(parsed.hooks.SessionStart[0].hooks[0].command).toBe("echo user hook");
        expect(JSON.stringify(parsed)).toContain("@forge-runtime:SessionStart");
        expect(JSON.stringify(parsed)).toContain("scripts/forge-hook-dispatch.mjs");
    });
    it("reports stale source shim commands", () => {
        writeFileSync(settingsPath, JSON.stringify({
            hooks: {
                PreCompact: [
                    {
                        hooks: [
                            {
                                type: "command",
                                command: "node old/path/forge-hook-dispatch.mjs PreCompact # @forge-runtime:PreCompact",
                            },
                        ],
                    },
                ],
            },
        }, null, 2));
        const report = detectRuntimeConfigDrift({
            projectRoot: root,
            mode: "source",
        });
        expect(report.staleHookEvents).toContain("PreCompact");
    });
    it("uses plugin-root paths in marketplace mode repair", () => {
        writeFileSync(settingsPath, "{}");
        repairRuntimeConfig({
            projectRoot: root,
            mode: "marketplace",
        });
        const content = readFileSync(settingsPath, "utf-8");
        const pluginRoot = "$" + "{CLAUDE_PLUGIN_ROOT}";
        const projectDir = "$" + "{CLAUDE_PROJECT_DIR}";
        expect(content).toContain(pluginRoot);
        expect(content).not.toContain(`${projectDir}/scripts/forge-hook-dispatch.mjs`);
    });
    it("script auto mode repairs source hooks when plugin root is absent", () => {
        const script = join(import.meta.dirname, "..", "scripts", "forge-sync-runtime.mjs");
        const env = { ...process.env };
        delete env.CLAUDE_PLUGIN_ROOT;
        const output = execFileSync(process.execPath, [script, "--repair", "--json"], {
            cwd: root,
            encoding: "utf-8",
            env,
        });
        const report = JSON.parse(output);
        const content = readFileSync(settingsPath, "utf-8");
        const projectDir = "$" + "{CLAUDE_PROJECT_DIR}";
        expect(report.mode).toBe("source");
        expect(content).toContain(`${projectDir}/scripts/forge-hook-dispatch.mjs`);
    });
    it("script auto mode repairs marketplace hooks when plugin root is present", () => {
        const script = join(import.meta.dirname, "..", "scripts", "forge-sync-runtime.mjs");
        const output = execFileSync(process.execPath, [script, "--repair", "--json"], {
            cwd: root,
            encoding: "utf-8",
            env: { ...process.env, CLAUDE_PLUGIN_ROOT: "/tmp/forge-plugin" },
        });
        const report = JSON.parse(output);
        const content = readFileSync(settingsPath, "utf-8");
        const pluginRoot = "$" + "{CLAUDE_PLUGIN_ROOT}";
        expect(report.mode).toBe("marketplace");
        expect(content).toContain(`${pluginRoot}/scripts/forge-hook-dispatch.mjs`);
    });
});
//# sourceMappingURL=runtime-config-sync.test.js.map