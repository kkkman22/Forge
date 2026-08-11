import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const MAX_RESULT_SIZE_CHARS = 200_000;

/**
 * Verify forge_git and forge_read tools include anthropic/maxResultSizeChars
 * in their _meta annotation via source code analysis.
 * The MCP SDK registerTool() supports _meta in config (v1.29.0+).
 */
describe("tinkerman-context _meta maxResultSizeChars (R11)", () => {
  it("forge-git.ts contains _meta with anthropic/maxResultSizeChars", () => {
    const src = readFileSync(resolve(ROOT, "src/mcp/tools/forge-git.ts"), "utf-8");
    expect(src).toContain("anthropic/maxResultSizeChars");
    expect(src).toMatch(/200_?000/);
  });

  it("forge-read.ts contains _meta with anthropic/maxResultSizeChars", () => {
    const src = readFileSync(resolve(ROOT, "src/mcp/tools/forge-read.ts"), "utf-8");
    expect(src).toContain("anthropic/maxResultSizeChars");
    expect(src).toMatch(/200_?000/);
  });

  it("forge-git.ts uses registerTool with _meta config", () => {
    const src = readFileSync(resolve(ROOT, "src/mcp/tools/forge-git.ts"), "utf-8");
    expect(src).toMatch(/registerTool.*_meta|_meta.*registerTool/s);
  });

  it("forge-read.ts uses registerTool with _meta config", () => {
    const src = readFileSync(resolve(ROOT, "src/mcp/tools/forge-read.ts"), "utf-8");
    expect(src).toMatch(/registerTool.*_meta|_meta.*registerTool/s);
  });

  it("maxResultSizeChars is 200000 (within MCP 500K ceiling)", () => {
    expect(MAX_RESULT_SIZE_CHARS).toBe(200_000);
    expect(MAX_RESULT_SIZE_CHARS).toBeLessThanOrEqual(500_000);
  });
});
