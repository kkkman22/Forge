import fc from "fast-check";
import { describe, expect, it } from "vitest";

// Dynamic import of ESM .mjs
const { shouldShowBootstrap } = await import("../scripts/bootstrap-check.mjs");

describe("shouldShowBootstrap property tests", () => {
  it("Property 4: show trigger condition - shouldShowBootstrap returns show iff config.md not exists AND .bootstrap-dismissed not exists AND pluginRoot is non-empty string", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        fc.boolean(),
        fc.boolean(),
        (pluginRoot, cwd, configExists, dismissedExists) => {
          const env = { pluginRoot, cwd };
          const fsExists = (path: string) => {
            return path.endsWith(".tinkerman/config.md")
              ? configExists
              : path.endsWith(".tinkerman/.bootstrap-dismissed")
                ? dismissedExists
                : false;
          };

          const result = shouldShowBootstrap(env, fsExists);
          const shouldShow = !configExists && !dismissedExists && pluginRoot.length > 0;

          return (result.kind === "show") === shouldShow;
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 5: never throws - For any env + fsExists input, never throws exception", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        fc.boolean(),
        fc.boolean(),
        (pluginRoot, cwd, configExists, dismissedExists) => {
          expect(() => {
            const env = { pluginRoot, cwd };
            const fsExists = (path: string) => {
              return path.endsWith(".tinkerman/config.md")
                ? configExists
                : path.endsWith(".tinkerman/.bootstrap-dismissed")
                  ? dismissedExists
                  : false;
            };

            shouldShowBootstrap(env, fsExists);
          }).not.toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });
});
