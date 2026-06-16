/**
 * Tests for installCronSkill — unified cron installer for skills (regenerative-checkpoint R5/D7).
 *
 * learn --install and triage --install share this primitive to install/uninstall/status
 * periodic skill triggers via CC's native CronCreate. Pure functions: validate cron expr,
 * resolve enabled flag from config, produce the CronCreate invocation spec.
 */
import { describe, expect, it } from "vitest";
import {
  validateCronExpression,
  resolveCronConfig,
  buildCronInstallSpec,
  shouldDebounceSpawn,
} from "../../src/loop/install-cron-skill.js";

describe("validateCronExpression", () => {
  it("accepts valid 5-field cron expressions", () => {
    expect(validateCronExpression("0 9 * * *")).toBe(true);
    expect(validateCronExpression("0 9 * * 1")).toBe(true);
    expect(validateCronExpression("*/30 * * * *")).toBe(true);
    expect(validateCronExpression("0 0 1 * *")).toBe(true);
  });

  it("rejects invalid expressions", () => {
    expect(validateCronExpression("")).toBe(false);
    expect(validateCronExpression("not a cron")).toBe(false);
    expect(validateCronExpression("* * *")).toBe(false); // too few fields
    expect(validateCronExpression("* * * * * *")).toBe(false); // too many fields (6+ unsupported)
  });
});

describe("resolveCronConfig", () => {
  it("uses provided values when config has them", () => {
    const result = resolveCronConfig({
      configBlock: { enabled: true, cron: "0 9 * * 1", interval_days: 7 },
      defaults: { enabled: false, cron: "0 9 * * *", intervalDays: 1 },
    });
    expect(result.enabled).toBe(true);
    expect(result.cron).toBe("0 9 * * 1");
    expect(result.intervalDays).toBe(7);
  });

  it("falls back to defaults when config block is missing/disabled", () => {
    const result = resolveCronConfig({
      configBlock: undefined,
      defaults: { enabled: false, cron: "0 9 * * *", intervalDays: 1 },
    });
    expect(result.enabled).toBe(false);
    expect(result.cron).toBe("0 9 * * *");
  });

  it("disabled flag blocks install regardless of cron value", () => {
    const result = resolveCronConfig({
      configBlock: { enabled: false, cron: "0 9 * * 1" },
      defaults: { enabled: false, cron: "0 9 * * *", intervalDays: 1 },
    });
    expect(result.enabled).toBe(false);
  });
});

describe("buildCronInstallSpec", () => {
  it("produces a CronCreate invocation spec for a skill", () => {
    const spec = buildCronInstallSpec({
      skillName: "learn",
      cron: "0 9 * * 1",
      prompt: "/forge learn --deep",
    });
    expect(spec.tool).toBe("CronCreate");
    expect(spec.cron).toBe("0 9 * * 1");
    expect(spec.prompt).toBe("/forge learn --deep");
    // CronCreate needs a label/title for the scheduled task.
    expect(spec.label).toContain("learn");
  });

  it("produces uninstall guidance", () => {
    const spec = buildCronInstallSpec({
      skillName: "triage",
      cron: "0 9 * * *",
      prompt: "/forge triage",
      action: "uninstall",
    });
    expect(spec.action).toBe("uninstall");
    expect(spec.label).toContain("triage");
  });

  // P3-3 coverage: step values
  it("validates step values (*/N, range/N)", () => {
    expect(validateCronExpression("*/15 * * * *")).toBe(true);
    expect(validateCronExpression("0-30/5 * * * *")).toBe(true);
    expect(validateCronExpression("1-10/2 * * * *")).toBe(true);
  });

  // P3-3 coverage: reversed range rejected
  it("rejects reversed ranges (e.g. 5-1)", () => {
    expect(validateCronExpression("5-1 * * * *")).toBe(false);
  });

  // P3-3 coverage: partial config block (cron without enabled)
  it("resolves partial config block (cron present, enabled absent → default)", () => {
    const result = resolveCronConfig({
      configBlock: { cron: "0 0 * * *" },
      defaults: { enabled: false, cron: "0 9 * * *", intervalDays: 1 },
    });
    expect(result.cron).toBe("0 0 * * *");
    expect(result.enabled).toBe(false); // falls back to default
  });
});

// P2: shouldDebounceSpawn (MIN_SPAWN_GAP)
describe("shouldDebounceSpawn", () => {
  it("returns false when never triggered before", () => {
    expect(shouldDebounceSpawn(undefined)).toBe(false);
  });

  it("returns true when last trigger was within MIN_SPAWN_GAP_MS", () => {
    const now = 1_000_000;
    expect(shouldDebounceSpawn(now - 5_000, now)).toBe(true); // 5s ago < 10s
  });

  it("returns false when last trigger was beyond MIN_SPAWN_GAP_MS", () => {
    const now = 1_000_000;
    expect(shouldDebounceSpawn(now - 15_000, now)).toBe(false); // 15s ago > 10s
  });
});
