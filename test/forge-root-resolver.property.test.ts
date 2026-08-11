/**
 * Property-based tests for the forge-root-resolver module.
 *
 * Properties tested:
 *   - Property 1: Plugin priority
 *   - Property 2: Completeness
 *   - Property 3: Fallback order
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { FsProbe, ResolveInput } from "../src/forge-root-resolver.js";
import { resolveForgeRoot } from "../src/forge-root-resolver.js";

// Helper to create a controlled FsProbe
const createFsProbe = (existingDirs: string[]): FsProbe => ({
  isDir: (path: string) => existingDirs.includes(path),
});

// Safe path generator (avoid problematic characters)
const safePath = () =>
  fc
    .string({
      minLength: 1,
      maxLength: 10,
    })
    .filter((s) => !s.includes("\0") && !s.includes(" ") && s !== "." && s !== "..")
    .map((s) => `/${s}`);

// ---------------------------------------------------------------------------
// Property 1: Plugin priority
// ---------------------------------------------------------------------------

describe("Feature: plugin-init-experience, Property 1: Plugin priority", () => {
  it("For any input where pluginRoot non-empty + fsProbe says agents exists → result kind === plugin, regardless of other paths", () => {
    fc.assert(
      fc.property(
        safePath(),
        safePath(),
        safePath(),
        safePath(),
        (pluginRoot, scriptDir, homeDir, _extraPath) => {
          const input: ResolveInput = {
            pluginRoot,
            scriptDir: `${scriptDir}/scripts`,
            homeDir,
          };

          // Ensure pluginRoot/agents exists, and also ensure other paths exist
          // to test that plugin takes priority regardless
          const existingDirs = [
            `${pluginRoot}/agents`,
            `${scriptDir}/agents`,
            `${homeDir}/.claude/skills/tinkerman/agents`,
          ];

          const fs = createFsProbe(existingDirs);
          const result = resolveForgeRoot(input, fs);

          expect(result.kind).toBe("plugin");
          expect("root" in result && result.root).toBe(pluginRoot);
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Completeness
// ---------------------------------------------------------------------------

describe("Feature: plugin-init-experience, Property 2: Completeness", () => {
  it("For any input + fsProbe → kind ∈ {plugin,script-relative,global,not-found}, never throws", () => {
    fc.assert(
      fc.property(
        fc.option(safePath(), { nil: null }),
        safePath(),
        safePath(),
        fc.array(safePath(), { maxLength: 5 }),
        (pluginRoot, scriptDir, homeDir, existingDirs) => {
          const input: ResolveInput = {
            pluginRoot,
            scriptDir: `${scriptDir}/scripts`,
            homeDir,
          };

          const fs = createFsProbe(existingDirs);

          // Should not throw
          const result = resolveForgeRoot(input, fs);

          // Result kind must be one of the four valid kinds
          const validKinds = ["plugin", "script-relative", "global", "not-found"];
          expect(validKinds).toContain(result.kind);
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Fallback order
// ---------------------------------------------------------------------------

describe("Feature: plugin-init-experience, Property 3: Fallback order", () => {
  it("When pluginRoot missing agents → won't skip script-relative to go directly to global", () => {
    fc.assert(
      fc.property(safePath(), safePath(), safePath(), (pluginRoot, scriptDir, homeDir) => {
        // When pluginRoot === scriptDir, the same agents/ dir satisfies both checks,
        // so plugin wins — exclude this case to test the fallback path.
        fc.pre(pluginRoot !== scriptDir);

        const input: ResolveInput = {
          pluginRoot,
          scriptDir: `${scriptDir}/scripts`,
          homeDir,
        };

        // pluginRoot/agents does NOT exist
        // scriptDir parent agents EXISTS
        // global agents EXISTS (but should not be used)
        const existingDirs = [`${scriptDir}/agents`, `${homeDir}/.claude/skills/tinkerman/agents`];

        const fs = createFsProbe(existingDirs);
        const result = resolveForgeRoot(input, fs);

        // Should return script-relative, not global
        expect(result.kind).toBe("script-relative");
        expect("root" in result && result.root).toBe(scriptDir);
      }),
    );
  });
});
