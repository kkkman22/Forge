import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  getCachedStatePath,
  isStateCacheExpired,
  promptForManualLogin,
} from "../src/login-state-cache.js";

describe("getCachedStatePath — property", () => {
  it("always returns a string starting with .tinkerman/cache/", () => {
    fc.assert(
      fc.property(fc.string(), (name) => {
        const path = getCachedStatePath(name);
        expect(path).toContain(".tinkerman/cache/login-state-");
      }),
    );
  });

  it("sanitizes special characters", () => {
    expect(getCachedStatePath("my/project")).toBe(".tinkerman/cache/login-state-my_project.json");
    expect(getCachedStatePath("project")).toBe(".tinkerman/cache/login-state-project.json");
  });
});

describe("isStateCacheExpired — property", () => {
  it("returns boolean for any input", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ expires: fc.option(fc.double(), { nil: undefined }) })),
        (cookies) => {
          expect(typeof isStateCacheExpired(cookies)).toBe("boolean");
        },
      ),
    );
  });

  it("empty cookies means expired", () => {
    expect(isStateCacheExpired([])).toBe(true);
  });

  it("future cookies not expired", () => {
    const future = Date.now() / 1000 + 86400 * 7;
    expect(isStateCacheExpired([{ expires: future }])).toBe(false);
  });

  it("past cookies expired", () => {
    const past = Date.now() / 1000 - 86400;
    expect(isStateCacheExpired([{ expires: past }])).toBe(true);
  });
});

describe("promptForManualLogin — unit", () => {
  it("includes surface ID in output", () => {
    const msg = promptForManualLogin("surf-123");
    expect(msg).toContain("surf-123");
    expect(msg).toContain("state save");
  });
});
