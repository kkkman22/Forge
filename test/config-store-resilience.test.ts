/**
 * Config Resilience tests — graceful parsing for config.md.
 *
 * Tests that missing config.md or partial config fields fall back to defaults.
 */

import { describe, expect, it } from "vitest";
import { CONFIG_DEFAULTS, type ConfigFields, parseConfigGraceful } from "../src/config-store.js";

// ---------------------------------------------------------------------------
// CONFIG_DEFAULTS completeness
// ---------------------------------------------------------------------------

describe("CONFIG_DEFAULTS", () => {
  it("has all required config fields", () => {
    const requiredFields: (keyof ConfigFields)[] = [
      "project",
      "stack",
      "security_level",
      "knowledge_limit",
      "max_parallel_agents",
    ];

    for (const field of requiredFields) {
      expect(CONFIG_DEFAULTS).toHaveProperty(field);
    }
  });

  it("has expected default values", () => {
    expect(CONFIG_DEFAULTS.project).toBe("unknown");
    expect(CONFIG_DEFAULTS.stack).toEqual(["TypeScript"]);
    expect(CONFIG_DEFAULTS.security_level).toBe(1);
    expect(CONFIG_DEFAULTS.knowledge_limit).toBe(20);
    expect(CONFIG_DEFAULTS.max_parallel_agents).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// parseConfigGraceful
// ---------------------------------------------------------------------------

describe("parseConfigGraceful", () => {
  it("returns all defaults when content is undefined", () => {
    const { parsed, warnings } = parseConfigGraceful(undefined);

    expect(parsed.project).toBe("unknown");
    expect(parsed.stack).toEqual(["TypeScript"]);
    expect(parsed.security_level).toBe(1);
    expect(parsed.knowledge_limit).toBe(20);
    expect(parsed.max_parallel_agents).toBe(6);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("returns all defaults when content is empty", () => {
    const { parsed } = parseConfigGraceful("");

    expect(parsed.project).toBe("unknown");
    expect(parsed.stack).toEqual(["TypeScript"]);
  });

  it("returns all defaults when content has no frontmatter", () => {
    const { parsed, warnings } = parseConfigGraceful("Just markdown\n");

    expect(parsed.project).toBe("unknown");
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("uses defaults for missing individual fields", () => {
    const content = `---
project: "MyApp"
stack:
  - "TypeScript"
  - "React"
---
Config body`;

    const { parsed, warnings } = parseConfigGraceful(content);

    expect(parsed.project).toBe("MyApp");
    expect(parsed.stack).toEqual(['"TypeScript"', '"React"']);
    expect(parsed.security_level).toBe(1);
    expect(parsed.knowledge_limit).toBe(20);
    expect(parsed.max_parallel_agents).toBe(6);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("preserves all provided fields", () => {
    const content = `---
project: "Forge"
stack:
  - "TypeScript"
  - "JavaScript"
  - "Shell"
security_level: 2
knowledge_limit: 30
max_parallel_agents: 4
max_subagent_depth: 3
---
Config body`;

    const { parsed, warnings } = parseConfigGraceful(content);

    expect(parsed.project).toBe("Forge");
    expect(parsed.stack).toEqual(['"TypeScript"', '"JavaScript"', '"Shell"']);
    expect(parsed.security_level).toBe(2);
    expect(parsed.knowledge_limit).toBe(30);
    expect(parsed.max_parallel_agents).toBe(4);
    expect(parsed.max_subagent_depth).toBe(3);
    expect(warnings).toEqual([]);
  });

  it("handles invalid numeric fields gracefully", () => {
    const content = `---
project: "Test"
stack:
  - "TypeScript"
security_level: not_a_number
knowledge_limit: abc
max_parallel_agents: xyz
---
Body`;

    const { parsed, warnings } = parseConfigGraceful(content);

    expect(parsed.project).toBe("Test");
    // Invalid numbers → defaults
    expect(parsed.security_level).toBe(1);
    expect(parsed.knowledge_limit).toBe(20);
    expect(parsed.max_parallel_agents).toBe(6);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
