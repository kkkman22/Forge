import { describe, it, expect } from "vitest";

describe("forge_read script mode deprecation", () => {
  it("source file contains deprecation warning for script mode", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile("src/mcp/tools/forge-read.ts", "utf-8");
    expect(source).toContain("deprecated");
    expect(source).toContain("structured operation");
  });

  it("deprecation message is appended to script mode return", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile("src/mcp/tools/forge-read.ts", "utf-8");

    // Find the script mode success return path (after "Return only stdout")
    const returnIdx = source.indexOf("Return only stdout");
    const sectionEnd = source.indexOf("},", returnIdx + 100);
    const section = source.slice(returnIdx, sectionEnd);
    expect(section).toContain("deprecated");
  });
});
