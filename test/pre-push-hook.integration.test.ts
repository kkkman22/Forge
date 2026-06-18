import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const HOOK = resolve(ROOT, ".githooks/pre-push");

describe("pre-push hook", () => {
  it("contains correct guard branch default (refs/heads/main)", () => {
    const content = readFileSync(HOOK, "utf-8");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: matching shell parameter expansion in source file
    expect(content).toContain('guard_branch="${FORGE_PRE_PUSH_BRANCH:-refs/heads/main}"');
  });

  it("skips when target is not main", () => {
    const content = readFileSync(HOOK, "utf-8");
    expect(content).toContain('if [ "$target_main" -eq 0 ]; then');
    expect(content).toContain("exit 0");
  });

  it("runs npm run check when target is main", () => {
    const content = readFileSync(HOOK, "utf-8");
    expect(content).toContain("npm run check");
  });

  it("blocks push on failure with clear message", () => {
    const content = readFileSync(HOOK, "utf-8");
    expect(content).toContain("pre-push blocked");
    expect(content).toContain("--no-verify");
  });

  it("respects FORGE_PRE_PUSH_BRANCH override", () => {
    const content = readFileSync(HOOK, "utf-8");
    expect(content).toContain("FORGE_PRE_PUSH_BRANCH");
  });

  it("starts with proper shebang", () => {
    const content = readFileSync(HOOK, "utf-8");
    expect(content.startsWith("#!/usr/bin/env bash")).toBe(true);
  });

  it("guards npm run check with a timeout so it cannot hang without a verdict", () => {
    const content = readFileSync(HOOK, "utf-8");
    // Without a cap, a stalled check leaves the push hanging with no pass/fail
    // verdict (observed during v3.5.0 release). Assert the deadline is actually
    // wired in — not just that the word "timeout" appears in a comment.
    expect(content).toContain("FORGE_PRE_PUSH_TIMEOUT");
    expect(content).toContain('pre_push_timeout="${FORGE_PRE_PUSH_TIMEOUT:-300}"');
    // The deadline must be ENFORCED in the loop and trigger a kill + verdict.
    expect(content).toMatch(/\[ "\$elapsed" -ge "\$pre_push_timeout" \]/);
    expect(content).toMatch(/timed_out=1/);
    expect(content).toContain("timed out after");
  });
});
