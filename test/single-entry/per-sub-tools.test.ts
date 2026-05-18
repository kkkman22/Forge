import { describe, expect, it } from "vitest";
import { resolveAllowedTools } from "../../src/forge-dispatcher/tools-resolve.js";

describe("R2.3: per-sub allowed-tools from frontmatter", () => {
  it("extracts allowed_tools from valid frontmatter", () => {
    const content = `---
description: test sub
allowed_tools:
  - Read
  - Glob
  - Grep
---
# Instructions`;
    const result = resolveAllowedTools(content);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tools).toEqual(["Read", "Glob", "Grep"]);
    }
  });

  it("returns E_TOOLS_UNDECLARED when allowed_tools missing", () => {
    const content = `---
description: test sub
---
# Instructions`;
    const result = resolveAllowedTools(content);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("E_TOOLS_UNDECLARED");
    }
  });

  it("returns E_TOOLS_UNDECLARED when allowed_tools is empty", () => {
    const content = `---
description: test sub
allowed_tools: []
---
# Instructions`;
    const result = resolveAllowedTools(content);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("E_TOOLS_UNDECLARED");
    }
  });
});
