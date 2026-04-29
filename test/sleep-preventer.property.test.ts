/**
 * Property-based tests for the sleep preventer module.
 *
 * Covers:
 *   - Property 19: 平台休眠防护命令生成
 *
 * **Validates: Requirements 8.2, 8.3, 8.4**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  buildCaffeinateCommand,
  buildPowerShellCommand,
  buildSleepPreventionCommand,
  buildSystemdInhibitCommand,
  isSupportedPlatform,
} from "../src/sleep-preventer.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Arbitrary PID: positive integer in a realistic range. */
const pidArb = fc.integer({ min: 1, max: 100000 });

/** Arbitrary supported platform string. */
const supportedPlatformArb = fc.constantFrom("darwin" as const, "linux" as const, "win32" as const);

/** Arbitrary unsupported platform string (anything other than the three supported). */
const unsupportedPlatformArb = fc
  .string()
  .filter((s) => s !== "darwin" && s !== "linux" && s !== "win32");

// ---------------------------------------------------------------------------
// Feature: gnhf-inspired-enhancements, Property 19: 平台休眠防护命令生成
// ---------------------------------------------------------------------------

describe("Feature: gnhf-inspired-enhancements, Property 19: 平台休眠防护命令生成", () => {
  /**
   * **Validates: Requirements 8.2**
   */
  it("darwin generates a caffeinate command with -i and -w <PID>", () => {
    fc.assert(
      fc.property(pidArb, (pid) => {
        const result = buildSleepPreventionCommand("darwin", pid);

        expect(result).not.toBeNull();
        expect(result?.command).toBe("caffeinate");
        expect(result?.args).toContain("-i");
        expect(result?.args).toContain("-w");
        expect(result?.args).toContain(String(pid));
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 8.2**
   */
  it("buildCaffeinateCommand produces correct caffeinate args", () => {
    fc.assert(
      fc.property(pidArb, (pid) => {
        const cmd = buildCaffeinateCommand(pid);

        expect(cmd.command).toBe("caffeinate");
        expect(cmd.args).toEqual(["-i", "-w", String(pid)]);
        expect(cmd.detached).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 8.4**
   */
  it("win32 generates a PowerShell command containing SetThreadExecutionState and ES_SYSTEM_REQUIRED", () => {
    fc.assert(
      fc.property(pidArb, (pid) => {
        const result = buildSleepPreventionCommand("win32", pid);

        expect(result).not.toBeNull();
        expect(result?.command).toBe("powershell.exe");

        const fullArgs = result?.args.join(" ");
        expect(fullArgs).toContain("SetThreadExecutionState");
        expect(fullArgs).toContain("ES_SYSTEM_REQUIRED");
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 8.4**
   */
  it("win32 PowerShell script contains Wait-Process -Id <PID>", () => {
    fc.assert(
      fc.property(pidArb, (pid) => {
        const result = buildSleepPreventionCommand("win32", pid);

        expect(result).not.toBeNull();

        const fullArgs = result?.args.join(" ");
        expect(fullArgs).toContain(`Wait-Process -Id ${pid}`);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 8.4**
   */
  it("buildPowerShellCommand produces script with SetThreadExecutionState and Wait-Process", () => {
    fc.assert(
      fc.property(pidArb, (pid) => {
        const script = buildPowerShellCommand(pid);

        expect(script).toContain("SetThreadExecutionState");
        expect(script).toContain("ES_SYSTEM_REQUIRED");
        expect(script).toContain(`Wait-Process -Id ${pid}`);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 8.3**
   */
  it("linux generates a systemd-inhibit command with --what=idle:sleep and --mode=block", () => {
    fc.assert(
      fc.property(pidArb, (pid) => {
        const result = buildSleepPreventionCommand("linux", pid);

        expect(result).not.toBeNull();
        expect(result?.command).toBe("systemd-inhibit");
        expect(result?.args).toContain("--what=idle:sleep");
        expect(result?.args).toContain("--mode=block");
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 8.3**
   */
  it("buildSystemdInhibitCommand includes --what=idle:sleep and --mode=block", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.array(fc.string(), { maxLength: 3 }),
        fc.string({ minLength: 1 }),
        fc.array(fc.string(), { maxLength: 5 }),
        (execPath, execArgv, scriptPath, argv) => {
          const cmd = buildSystemdInhibitCommand(execPath, execArgv, scriptPath, argv);

          expect(cmd.command).toBe("systemd-inhibit");
          expect(cmd.args).toContain("--what=idle:sleep");
          expect(cmd.args).toContain("--mode=block");
          expect(cmd.detached).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 8.2, 8.3, 8.4**
   */
  it("unsupported platforms return null", () => {
    fc.assert(
      fc.property(unsupportedPlatformArb, (platform) => {
        const result = buildSleepPreventionCommand(platform, 1234);

        expect(result).toBeNull();
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 8.2, 8.3, 8.4**
   */
  it("isSupportedPlatform returns true only for darwin, linux, win32", () => {
    fc.assert(
      fc.property(supportedPlatformArb, (platform) => {
        expect(isSupportedPlatform(platform)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 8.2, 8.3, 8.4**
   */
  it("isSupportedPlatform returns false for unsupported platforms", () => {
    fc.assert(
      fc.property(unsupportedPlatformArb, (platform) => {
        expect(isSupportedPlatform(platform)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 8.2, 8.3, 8.4**
   */
  it("buildSleepPreventionCommand returns non-null for all supported platforms", () => {
    fc.assert(
      fc.property(supportedPlatformArb, pidArb, (platform, pid) => {
        const result = buildSleepPreventionCommand(platform, pid);

        expect(result).not.toBeNull();
        expect(result?.command).toBeTruthy();
        expect(Array.isArray(result?.args)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});
