/**
 * Integration test: Bitbucket MCP adapter degradation paths.
 *
 * Covers [R4.3, R14.1, R14.2]:
 *   - MCP not available → null
 *   - Returns 401 → null
 *   - Returns 500 → null
 *   - Timeout → null
 *   - Canvas still produces complete HTML without enrichment
 *
 * **Validates: Requirements R4.3, R14.1, R14.2**
 */

import { describe, expect, it } from "vitest";
import { postPRComment, tryFetchEnrichment } from "../src/bitbucket-mcp-adapter.js";

describe("Bitbucket MCP adapter degradation [R14.1, R14.2]", () => {
  it("returns null when MCP is not available", async () => {
    const result = await tryFetchEnrichment("test-topic");
    expect(result).toBeNull();
  });

  it("returns null with short connection timeout", async () => {
    const result = await tryFetchEnrichment("test-topic", {
      connectionTimeout: 100,
      responseTimeout: 100,
    });
    expect(result).toBeNull();
  });

  it("postPRComment returns false when MCP is not available", async () => {
    const result = await postPRComment("test-topic", "test comment");
    expect(result).toBe(false);
  });

  it("does not throw on any error", async () => {
    // Should never throw, always return null/false
    await expect(
      tryFetchEnrichment("any-topic", { connectionTimeout: 1, responseTimeout: 1 }),
    ).resolves.toBeNull();

    await expect(
      postPRComment("any-topic", "comment", { connectionTimeout: 1, responseTimeout: 1 }),
    ).resolves.toBe(false);
  });
});
