import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { glob } from "glob";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..", "..");
const SUBS = [
  "abort",
  "accept",
  "build",
  "control-cli",
  "control-ui",
  "debug",
  "decide",
  "fix",
  "fix-conflicts",
  "grill",
  "learn",
  "loop",
  "mutate",
  "pack",
  "plan",
  "recap",
  "refactor",
  "resume",
  "review",
  "router",
  "ship",
  "spec",
  "status",
  "storm",
  "test",
  "verify",
  "zoom-out",
];

describe("R1.4: migration structure", () => {
  it("legacy skills/tinkerman-* directories must not exist", async () => {
    const legacy = await glob("skills/tinkerman-*/", { cwd: ROOT });
    expect(legacy).toHaveLength(0);
  });

  it.each(SUBS)("instructions.md exists for sub %s", (sub) => {
    expect(existsSync(resolve(ROOT, `skills/tinkerman/lib/${sub}/instructions.md`))).toBe(true);
  });
});
