import { describe, expect, it } from "vitest";

// ESM import from .mjs — vitest handles this
import { suggestCiCommand } from "../scripts/suggest-ci-command.mjs";

describe("suggestCiCommand", () => {
  // Case 1: valid scripts.check → "npm run check"
  it("returns 'npm run check' when package.json has scripts.check", () => {
    expect(suggestCiCommand('{"scripts":{"check":"npm run check"}}')).toBe("npm run check");
  });

  // Case 2: no scripts.check → null
  it("returns null when package.json has no scripts.check", () => {
    expect(suggestCiCommand('{"scripts":{}}')).toBeNull();
  });

  // Case 3: null input → null
  it("returns null when packageJson is null", () => {
    expect(suggestCiCommand(null)).toBeNull();
  });

  // Case 4: malformed JSON → null
  it("returns null for malformed JSON", () => {
    expect(suggestCiCommand("not json")).toBeNull();
  });
});
