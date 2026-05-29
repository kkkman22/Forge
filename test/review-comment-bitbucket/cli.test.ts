import { describe, expect, it } from "vitest";
import type { ResolvedConfig } from "../../src/review-comment-bitbucket/types.js";
import { applyCliOverrides } from "../../src/review-comment-bitbucket/cli.js";

const defaultConfig: ResolvedConfig = {
  enabled: false,
  platform: "bitbucket",
  platform_override: "auto",
  p0_p1_strategy: "both",
  p2_strategy: "inline",
  p3_strategy: "none",
  request_changes_on_p0_p1: true,
  auto_reconcile_resolved: true,
  auto_reopen_regressed: true,
  comment_marker_prefix: "forge-review",
  rate_limit_interval_ms: 500,
};

describe("Unit: --post-comments alone → enabled=true even if config=false", () => {
  it("forces enabled to true", () => {
    const config = { ...defaultConfig, enabled: false };
    const argv = ["--post-comments"];
    const result = applyCliOverrides(config, argv);

    expect(result.enabled).toBe(true);
    expect(result.platform).toBe(config.platform);
    expect(result.platform_override).toBe(config.platform_override);
    expect(result.p0_p1_strategy).toBe(config.p0_p1_strategy);
    expect(result.p2_strategy).toBe(config.p2_strategy);
    expect(result.p3_strategy).toBe(config.p3_strategy);
    expect(result.request_changes_on_p0_p1).toBe(config.request_changes_on_p0_p1);
    expect(result.auto_reconcile_resolved).toBe(config.auto_reconcile_resolved);
    expect(result.auto_reopen_regressed).toBe(config.auto_reopen_regressed);
    expect(result.comment_marker_prefix).toBe(config.comment_marker_prefix);
    expect(result.rate_limit_interval_ms).toBe(config.rate_limit_interval_ms);
  });
});

describe("Unit: --no-post-comments alone → enabled=false even if config=true", () => {
  it("forces enabled to false", () => {
    const config = { ...defaultConfig, enabled: true };
    const argv = ["--no-post-comments"];
    const result = applyCliOverrides(config, argv);

    expect(result.enabled).toBe(false);
    expect(result.platform).toBe(config.platform);
    expect(result.platform_override).toBe(config.platform_override);
    expect(result.p0_p1_strategy).toBe(config.p0_p1_strategy);
    expect(result.p2_strategy).toBe(config.p2_strategy);
    expect(result.p3_strategy).toBe(config.p3_strategy);
    expect(result.request_changes_on_p0_p1).toBe(config.request_changes_on_p0_p1);
    expect(result.auto_reconcile_resolved).toBe(config.auto_reconcile_resolved);
    expect(result.auto_reopen_regressed).toBe(config.auto_reopen_regressed);
    expect(result.comment_marker_prefix).toBe(config.comment_marker_prefix);
    expect(result.rate_limit_interval_ms).toBe(config.rate_limit_interval_ms);
  });
});

describe("Unit: both flags → throws with mutual exclusion message", () => {
  it("throws error containing the mutual exclusion message", () => {
    const config = { ...defaultConfig, enabled: false };
    const argv = ["--post-comments", "--no-post-comments"];

    expect(() => applyCliOverrides(config, argv)).toThrow(
      /--post-comments 与 --no-post-comments 互斥/,
    );
  });

  it("throws regardless of order", () => {
    const config = { ...defaultConfig, enabled: false };
    const argv = ["--no-post-comments", "--post-comments"];

    expect(() => applyCliOverrides(config, argv)).toThrow(
      /--post-comments 与 --no-post-comments 互斥/,
    );
  });
});

describe("Unit: no flags → config unchanged", () => {
  it("returns config as-is with no flags", () => {
    const config = { ...defaultConfig, enabled: true };
    const argv: string[] = [];
    const result = applyCliOverrides(config, argv);

    expect(result).toEqual(config);
    expect(result).toBe(config);
  });

  it("ignores other flags", () => {
    const config = { ...defaultConfig, enabled: true };
    const argv = ["--other-flag", "value"];
    const result = applyCliOverrides(config, argv);

    expect(result).toEqual(config);
  });
});

describe("Unit: flag only affects enabled, other fields unchanged", () => {
  it("--post-comments only changes enabled", () => {
    const config = {
      ...defaultConfig,
      enabled: false,
      p0_p1_strategy: "inline-only" as const,
      rate_limit_interval_ms: 1000,
    };
    const argv = ["--post-comments"];
    const result = applyCliOverrides(config, argv);

    expect(result.enabled).toBe(true);
    expect(result.p0_p1_strategy).toBe("inline-only");
    expect(result.rate_limit_interval_ms).toBe(1000);
    expect(result.platform_override).toBe(config.platform_override);
    expect(result.request_changes_on_p0_p1).toBe(config.request_changes_on_p0_p1);
    expect(result.auto_reconcile_resolved).toBe(config.auto_reconcile_resolved);
    expect(result.auto_reopen_regressed).toBe(config.auto_reopen_regressed);
    expect(result.comment_marker_prefix).toBe(config.comment_marker_prefix);
  });

  it("--no-post-comments only changes enabled", () => {
    const config = {
      ...defaultConfig,
      enabled: true,
      p0_p1_strategy: "pr-task" as const,
      rate_limit_interval_ms: 2000,
    };
    const argv = ["--no-post-comments"];
    const result = applyCliOverrides(config, argv);

    expect(result.enabled).toBe(false);
    expect(result.p0_p1_strategy).toBe("pr-task");
    expect(result.rate_limit_interval_ms).toBe(2000);
    expect(result.platform_override).toBe(config.platform_override);
    expect(result.request_changes_on_p0_p1).toBe(config.request_changes_on_p0_p1);
    expect(result.auto_reconcile_resolved).toBe(config.auto_reconcile_resolved);
    expect(result.auto_reopen_regressed).toBe(config.auto_reopen_regressed);
    expect(result.comment_marker_prefix).toBe(config.comment_marker_prefix);
  });
});