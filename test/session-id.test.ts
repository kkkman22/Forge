/**
 * Unit tests for src/session-id.ts — Session ID resolver.
 *
 * Validates Requirements 4.1–4.4, 4.6.
 */
import { describe, expect, it } from "vitest";

describe("resolveSessionId", () => {
  it("pid-only fallback → source pid-fallback, value pid-NNNN", async () => {
    const { resolveSessionId } = await import("../src/session-id.js");
    const result = resolveSessionId({ processPid: 1234 });
    expect(result.value).toBe("pid-1234");
    expect(result.source).toBe("pid-fallback");
  });

  it("all identical → consistent true", async () => {
    const { resolveSessionId } = await import("../src/session-id.js");
    const result = resolveSessionId({
      hookSessionId: "abc",
      envClaudeCodeSessionId: "abc",
      processPid: 1234,
    });
    expect(result.value).toBe("abc");
    expect(result.consistent).toBe(true);
  });

  it("conflicting → consistent false with mismatch detail", async () => {
    const { resolveSessionId } = await import("../src/session-id.js");
    const result = resolveSessionId({
      hookSessionId: "abc",
      envClaudeCodeSessionId: "xyz",
      processPid: 1234,
    });
    expect(result.value).toBe("abc"); // hook wins
    expect(result.consistent).toBe(false);
    expect(result.mismatch).toBeDefined();
    expect(result.mismatch!.length).toBeGreaterThan(0);
  });

  it("legacy CLAUDE_SESSION_ID used when newer vars absent", async () => {
    const { resolveSessionId } = await import("../src/session-id.js");
    const result = resolveSessionId({
      envLegacyClaudeSessionId: "legacy-123",
      processPid: 9999,
    });
    expect(result.value).toBe("legacy-123");
    expect(result.source).toBe("CLAUDE_SESSION_ID");
  });
});

describe("sessionScopedKey", () => {
  it("formats as prefix-value", async () => {
    const { resolveSessionId, sessionScopedKey } = await import("../src/session-id.js");
    const session = resolveSessionId({
      hookSessionId: "abc",
      processPid: 1234,
    });
    expect(sessionScopedKey("lock", session)).toBe("lock-abc");
  });

  it("pid fallback formats as lock-pid-NNNN", async () => {
    const { resolveSessionId, sessionScopedKey } = await import("../src/session-id.js");
    const session = resolveSessionId({ processPid: 5678 });
    expect(sessionScopedKey("lock", session)).toBe("lock-pid-5678");
  });
});
