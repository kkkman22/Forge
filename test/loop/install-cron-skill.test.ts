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
});
