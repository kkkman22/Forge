import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectRuntimeConfigDrift, repairRuntimeConfig } from "../src/runtime-config-sync.js";

describe("runtime-config-sync", () => {
  let root: string;
  let settingsPath: string;

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
    expect(report.missingHookEvents).toEqual(
      expect.arrayContaining(["PreCompact", "PostCompact", "UserPromptSubmit", "Stop"]),
    );
  });

  it("repairs source mode hooks without deleting user hooks", () => {
    writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          hooks: {
            SessionStart: [
              {
                hooks: [{ type: "command", command: "echo user hook" }],
              },
            ],
          },
        },
        null,
        2,
      ),
    );

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
    writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          hooks: {
            PreCompact: [
              {
                hooks: [
                  {
                    type: "command",
                    command:
                      "node old/path/forge-hook-dispatch.mjs PreCompact # @forge-runtime:PreCompact",
                  },
                ],
              },
            ],
          },
        },
        null,
        2,
      ),
    );

    const report = detectRuntimeConfigDrift({
      projectRoot: root,
      mode: "source",
    });

    expect(report.staleHookEvents).toContain("PreCompact");
  });

  it("marketplace mode repair is a no-op when settings.json is clean (plugin hooks.json is the source of truth)", () => {
    // Marketplace installs must NOT write Forge runtime shims into the project
    // settings.json: Claude Code rejects ${CLAUDE_PLUGIN_ROOT} at project scope,
    // and the plugin's own hooks/hooks.json already provides every hook.
    writeFileSync(settingsPath, "{}");

    const result = repairRuntimeConfig({
      projectRoot: root,
      mode: "marketplace",
    });

    expect(result.changed).toBe(false);
    const content = readFileSync(settingsPath, "utf-8");
    expect(content).not.toContain("@forge-runtime");
    expect(content).not.toContain("$" + "{CLAUDE_PLUGIN_ROOT}");
  });

  it("marketplace mode repair CLEANS legacy @forge-runtime shims left by older Forge versions", () => {
    // Regression: 336801e0 stopped ADDING shims in marketplace mode but never
    // removed shims that older versions (using ${CLAUDE_PLUGIN_ROOT}) had
    // already injected. Projects that init'd under an old Forge then upgraded
    // kept stale shims that Claude Code rejects on every Stop/SessionStart,
    // because repair()/detect() short-circuited before touching them.
    const pluginRoot = "$" + "{CLAUDE_PLUGIN_ROOT}";
    const staleSettings = {
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                type: "command",
                command: `node ${pluginRoot}/scripts/forge-hook-dispatch.mjs SessionStart # @forge-runtime:SessionStart`,
                timeout: 5,
              },
            ],
          },
        ],
        Stop: [
          {
            hooks: [
              {
                type: "command",
                command: `node ${pluginRoot}/scripts/forge-hook-dispatch.mjs Stop # @forge-runtime:Stop`,
                timeout: 5,
              },
            ],
          },
        ],
      },
    };
    writeFileSync(settingsPath, JSON.stringify(staleSettings, null, 2));

    const result = repairRuntimeConfig({
      projectRoot: root,
      mode: "marketplace",
    });

    expect(result.changed).toBe(true);
    const parsed = JSON.parse(readFileSync(settingsPath, "utf-8"));
    // All @forge-runtime shims removed across every event...
    expect(JSON.stringify(parsed)).not.toContain("@forge-runtime");
    expect(JSON.stringify(parsed)).not.toContain(pluginRoot);
    // ...and empty hook arrays are dropped (no leftover skeleton).
    const hooks = parsed.hooks || {};
    expect(Object.keys(hooks).length).toBe(0);
  });

  it("marketplace mode reports no drift even on an empty settings.json", () => {
    // The plugin provides all hooks via hooks/hooks.json; the project settings
    // is never expected to carry Forge runtime shims in marketplace mode.
    writeFileSync(settingsPath, "{}");

    const report = detectRuntimeConfigDrift({
      projectRoot: root,
      mode: "marketplace",
    });

    expect(report.mode).toBe("marketplace");
    expect(report.drift).toBe(false);
    expect(report.missingHookEvents).toEqual([]);
    expect(report.staleHookEvents).toEqual([]);
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

  it("script auto mode leaves a clean settings.json untouched when plugin root is present", () => {
    // Marketplace mode: the script must NOT ADD Forge runtime shims.
    // A settings.json with no @forge-runtime markers is left byte-for-byte
    // untouched.
    const pre = JSON.stringify({ env: { FOO: "bar" } }, null, 2);
    writeFileSync(settingsPath, `${pre}\n`);

    const script = join(import.meta.dirname, "..", "scripts", "forge-sync-runtime.mjs");

    const output = execFileSync(process.execPath, [script, "--repair", "--json"], {
      cwd: root,
      encoding: "utf-8",
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: "/tmp/forge-plugin" },
    });

    const report = JSON.parse(output);
    const content = readFileSync(settingsPath, "utf-8");
    expect(report.mode).toBe("marketplace");
    expect(report.drift).toBe(false);
    // The pre-existing file is left byte-for-byte untouched.
    expect(content).toBe(`${pre}\n`);
    expect(content).not.toContain("@forge-runtime");
    expect(content).not.toContain("$" + "{CLAUDE_PLUGIN_ROOT}");
  });

  it("script auto mode cleans legacy @forge-runtime shims when plugin root is present", () => {
    // Regression for 336801e0: a settings.json carrying shims from an older
    // Forge (with ${CLAUDE_PLUGIN_ROOT}) must be cleaned, not left untouched.
    const pluginRoot = "$" + "{CLAUDE_PLUGIN_ROOT}";
    const staleSettings = {
      hooks: {
        Stop: [
          {
            hooks: [
              {
                type: "command",
                command: `node ${pluginRoot}/scripts/forge-hook-dispatch.mjs Stop # @forge-runtime:Stop`,
                timeout: 5,
              },
            ],
          },
        ],
      },
    };
    writeFileSync(settingsPath, JSON.stringify(staleSettings, null, 2));

    const script = join(import.meta.dirname, "..", "scripts", "forge-sync-runtime.mjs");
    const output = execFileSync(process.execPath, [script, "--repair", "--json"], {
      cwd: root,
      encoding: "utf-8",
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: "/tmp/forge-plugin" },
    });

    const report = JSON.parse(output);
    expect(report.mode).toBe("marketplace");
    const content = readFileSync(settingsPath, "utf-8");
    expect(content).not.toContain("@forge-runtime");
    expect(content).not.toContain(pluginRoot);
  });
});
