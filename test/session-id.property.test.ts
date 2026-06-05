/**
 * Property tests for src/session-id.ts — Session ID resolver.
 *
 * Validates Requirements 4.1, 4.2, 4.5, 4.6:
 * - resolveSessionId: always returns non-empty value
 * - source priority: hook > CLAUDE_CODE_SESSION_ID > CLAUDE_SESSION_ID > pid-fallback
 * - sessionScopedKey: always returns <prefix>-<value> format
 * - Consistency: identical sources → consistent: true
 * - Conflict: divergent sources → consistent: false, mismatch non-empty
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

describe("session-id property tests", () => {
  // Arbitrary: optional non-empty string + required positive pid
  const sessionIdArb = fc.oneof(fc.constant(undefined), fc.stringMatching(/^[a-z0-9_-]{4,32}$/));
  const pidArb = fc.integer({ min: 1, max: 65535 });

  describe("resolveSessionId", () => {
    it("always returns non-empty value for any input combination", async () => {
      const { resolveSessionId } = await import("../src/session-id.js");
      fc.assert(
        fc.property(sessionIdArb, sessionIdArb, sessionIdArb, pidArb,
          (hookId, ccId, legacyId, pid) => {
            const result = resolveSessionId({
              hookSessionId: hookId,
              envClaudeCodeSessionId: ccId,
              envLegacyClaudeSessionId: legacyId,
              processPid: pid,
            });
            expect(result.value).toBeTruthy();
            expect(result.value.length).toBeGreaterThan(0);
          },
        ),
      );
    });

    it("source priority: hook > CLAUDE_CODE_SESSION_ID > CLAUDE_SESSION_ID > pid-fallback", async () => {
      const { resolveSessionId } = await import("../src/session-id.js");
      // All present and identical → hook wins
      const allSame = resolveSessionId({
        hookSessionId: "abc",
        envClaudeCodeSessionId: "abc",
        envLegacyClaudeSessionId: "abc",
        processPid: 1234,
      });
      expect(allSame.value).toBe("abc");
      expect(allSame.source).toBe("hook");

      // hook absent, CC present → CC wins
      const noHook = resolveSessionId({
        hookSessionId: undefined,
        envClaudeCodeSessionId: "def",
        envLegacyClaudeSessionId: "def",
        processPid: 1234,
      });
      expect(noHook.value).toBe("def");
      expect(noHook.source).toBe("CLAUDE_CODE_SESSION_ID");

      // hook + CC absent, legacy present → legacy wins
      const noHookNoCC = resolveSessionId({
        hookSessionId: undefined,
        envClaudeCodeSessionId: undefined,
        envLegacyClaudeSessionId: "ghi",
        processPid: 1234,
      });
      expect(noHookNoCC.value).toBe("ghi");
      expect(noHookNoCC.source).toBe("CLAUDE_SESSION_ID");

      // All absent → pid fallback
      const noAll = resolveSessionId({
        hookSessionId: undefined,
        envClaudeCodeSessionId: undefined,
        envLegacyClaudeSessionId: undefined,
        processPid: 5678,
      });
      expect(noAll.value).toBe("pid-5678");
      expect(noAll.source).toBe("pid-fallback");
    });

    it("identical sources → consistent: true", async () => {
      const { resolveSessionId } = await import("../src/session-id.js");
      fc.assert(
        fc.property(fc.stringMatching(/^[a-z0-9]{4,20}$/), pidArb, (id, pid) => {
          const result = resolveSessionId({
            hookSessionId: id,
            envClaudeCodeSessionId: id,
            envLegacyClaudeSessionId: id,
            processPid: pid,
          });
          expect(result.consistent).toBe(true);
          expect(result.mismatch).toBeUndefined();
        }),
      );
    });

    it("conflicting sources → consistent: false, mismatch non-empty", async () => {
      const { resolveSessionId } = await import("../src/session-id.js");
      const result = resolveSessionId({
        hookSessionId: "aaa",
        envClaudeCodeSessionId: "bbb",
        envLegacyClaudeSessionId: "ccc",
        processPid: 1234,
      });
      expect(result.consistent).toBe(false);
      expect(result.mismatch).toBeDefined();
      expect(result.mismatch!.length).toBeGreaterThan(0);
    });
  });

  describe("sessionScopedKey", () => {
    it("always returns prefix-value format", async () => {
      const { resolveSessionId, sessionScopedKey } = await import("../src/session-id.js");
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-z]{2,10}$/),
          sessionIdArb,
          pidArb,
          (prefix, hookId, pid) => {
            const session = resolveSessionId({
              hookSessionId: hookId,
              processPid: pid,
            });
            const key = sessionScopedKey(prefix, session);
            expect(key).toContain(`${prefix}-`);
            expect(key.length).toBeGreaterThan(prefix.length + 1);
          },
        ),
      );
    });
  });
});
