import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Verifies spec R4-AC3 (evidence dir gitignored) and R4-AC6 (agent-browser pin).
// T4.1

describe(".gitignore protects acceptance evidence", () => {
  it("ignores .tinkerman/acceptance/", () => {
    const gi = readFileSync(".gitignore", "utf8");
    expect(gi).toContain(".tinkerman/acceptance/");
  });
});

describe(".tinkerman/config.md pins agent-browser", () => {
  it("declares agent_browser_pin_sha256 field", () => {
    const cfg = readFileSync(".tinkerman/config.md", "utf8");
    expect(cfg).toMatch(/agent_browser_pin_sha256/);
  });
});
