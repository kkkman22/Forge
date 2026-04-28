/**
 * Property-based tests for the generic file reader in SdkDriver.
 *
 * **Property 4: Generic file reader — null safety**
 * **Validates: Requirements 4.1, 4.5, 4.6**
 *
 * For any reader callback configuration:
 * - If reader is `undefined`, result is `null`
 * - If reader throws any `Error`, result is `null`
 * - If reader returns a string, result equals that string
 *
 * Tests the `readFileContent` private method indirectly by constructing
 * SdkDriver instances and accessing the method via the test harness.
 */
import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock RunManager.persistNotes before importing SdkDriver
vi.mock("../src/run-manager.js", () => ({
  RunManager: { persistNotes: vi.fn() },
}));

import type { EffectExecutorInterface } from "../src/effect-executor.js";
import type { AgentInterface, LoopConfig, RunLimits } from "../src/loop-types.js";
import { SdkDriver, type SdkDriverConfig } from "../src/sdk-driver.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal SdkDriverConfig with optional readReviewFile callback. */
function buildConfig(readReviewFile?: (() => string) | undefined): SdkDriverConfig {
  return {
    objective: "test objective",
    loopConfig: {
      agent: "claude",
      maxConsecutiveFailures: 3,
      preventSleep: false,
      backoffBaseMs: 60000,
      maxConcurrentWorktrees: 3,
    } as LoopConfig,
    limits: {} as RunLimits,
    cwd: "/test/repo",
    runId: "test-run-id",
    runDir: "/test/runs/test-run-id",
    warmQuery: {},
    baseCommit: "abc123",
    notesPath: "/test/runs/test-run-id/notes.md",
    branchName: "forge/test-branch",
    skillAware: false,
    readReviewFile,
    readTestFile: undefined,
    readProgressFile: undefined,
  };
}

/** Minimal mock EffectExecutor. */
function createMockEffectExecutor(): EffectExecutorInterface {
  return {
    aborted: false,
    stopped: false,
    executeEffect: vi.fn().mockResolvedValue(undefined),
    executeEffects: vi.fn().mockResolvedValue(undefined),
  };
}

/** Minimal mock AgentInterface. */
function createMockAgentInterface(): AgentInterface {
  return {
    name: "test",
    run: vi.fn(),
    close: vi.fn(),
  };
}

/**
 * Access the private `readFileContent` method on a SdkDriver instance.
 * Uses the test harness pattern to invoke the private method directly.
 */
function callReadFileContent(driver: SdkDriver, reader: (() => string) | undefined): string | null {
  // biome-ignore lint/suspicious/noExplicitAny: accessing private method for testing
  return (driver as any).readFileContent(reader);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Property 4: Generic file reader — null safety
// ---------------------------------------------------------------------------

describe("Property 4: Generic file reader — null safety", () => {
  /**
   * **Validates: Requirements 4.1, 4.5, 4.6**
   *
   * For any reader callback:
   * - undefined → null
   * - throws → null
   * - returns string → that string
   */
  it("returns null when reader is undefined", () => {
    fc.assert(
      fc.property(fc.constant(undefined), (_reader) => {
        const config = buildConfig(undefined);
        const driver = new SdkDriver(
          config,
          createMockEffectExecutor(),
          createMockAgentInterface(),
        );

        const result = callReadFileContent(driver, undefined);
        expect(result).toBeNull();
      }),
    );
  });

  it("returns null when reader throws any Error", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 200 }), (errorMessage) => {
        const config = buildConfig(undefined);
        const driver = new SdkDriver(
          config,
          createMockEffectExecutor(),
          createMockAgentInterface(),
        );

        const throwingReader = (): string => {
          throw new Error(errorMessage);
        };

        const result = callReadFileContent(driver, throwingReader);
        expect(result).toBeNull();
      }),
    );
  });

  it("returns null when reader throws a non-Error value", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.constant(undefined),
        ),
        (thrownValue) => {
          const config = buildConfig(undefined);
          const driver = new SdkDriver(
            config,
            createMockEffectExecutor(),
            createMockAgentInterface(),
          );

          const throwingReader = (): string => {
            throw thrownValue;
          };

          const result = callReadFileContent(driver, throwingReader);
          expect(result).toBeNull();
        },
      ),
    );
  });

  it("returns the string when reader returns a string", () => {
    fc.assert(
      fc.property(fc.string(), (content) => {
        const config = buildConfig(undefined);
        const driver = new SdkDriver(
          config,
          createMockEffectExecutor(),
          createMockAgentInterface(),
        );

        const stringReader = (): string => content;

        const result = callReadFileContent(driver, stringReader);
        expect(result).toBe(content);
      }),
    );
  });

  it("unified property: undefined → null, throws → null, returns string → that string", () => {
    // Arbitrary that produces one of three reader scenarios
    const readerArb: fc.Arbitrary<{
      reader: (() => string) | undefined;
      expected: string | null;
    }> = fc.oneof(
      // Case 1: undefined reader → null
      fc.constant({
        reader: undefined as (() => string) | undefined,
        expected: null as string | null,
      }),
      // Case 2: throwing reader → null
      fc.string({ minLength: 0, maxLength: 200 }).map((msg) => ({
        reader: (() => {
          throw new Error(msg);
        }) as () => string,
        expected: null as string | null,
      })),
      // Case 3: string-returning reader → that string
      fc.string().map((content) => ({
        reader: (() => content) as () => string,
        expected: content,
      })),
    );

    fc.assert(
      fc.property(readerArb, ({ reader, expected }) => {
        const config = buildConfig(undefined);
        const driver = new SdkDriver(
          config,
          createMockEffectExecutor(),
          createMockAgentInterface(),
        );

        const result = callReadFileContent(driver, reader);
        expect(result).toBe(expected);
      }),
    );
  });
});
