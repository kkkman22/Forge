import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Import the functions under test — they don't exist yet, so this will fail at import
import {
  buildGoalCondition,
  clearGoal,
  setGoal,
  shouldClearGoal,
} from "../../src/forge/goal-integration";

const ROOT = resolve(__dirname, "../..");
const THREE_STRIKE_PATH = resolve(ROOT, ".tinkerman/state/three-strike-counter.json");

describe("goal-integration (R4)", () => {
  describe("buildGoalCondition", () => {
    it("returns null for light tier (no goal)", () => {
      expect(buildGoalCondition("light")).toBeNull();
    });

    it("returns correct string for standard tier", () => {
      const result = buildGoalCondition("standard");
      expect(result).toBe("完成 plan→build→review→test→ship 流程，且无 P0/P1 阻断");
    });

    it("returns correct string for full tier", () => {
      const result = buildGoalCondition("full");
      expect(result).toBe(
        "完成 decide→spec→plan→build→review→test→ship→learn 流程，且无 P0/P1 阻断",
      );
    });
  });

  describe("shouldClearGoal", () => {
    beforeEach(() => {
      // Ensure the state directory exists and clean up any leftover file
      const dir = resolve(ROOT, ".tinkerman/state");
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      if (existsSync(THREE_STRIKE_PATH)) {
        rmSync(THREE_STRIKE_PATH);
      }
    });

    afterEach(() => {
      // Clean up
      if (existsSync(THREE_STRIKE_PATH)) {
        rmSync(THREE_STRIKE_PATH);
      }
    });

    it("returns true when three-strike count >= 3", async () => {
      writeFileSync(
        THREE_STRIKE_PATH,
        JSON.stringify({ count: 3, lastFailure: "2026-05-28T00:00:00Z" }),
      );
      expect(await shouldClearGoal(ROOT)).toBe(true);
    });

    it("returns true when three-strike count > 3", async () => {
      writeFileSync(
        THREE_STRIKE_PATH,
        JSON.stringify({ count: 5, lastFailure: "2026-05-28T00:00:00Z" }),
      );
      expect(await shouldClearGoal(ROOT)).toBe(true);
    });

    it("returns false when count < 3", async () => {
      writeFileSync(
        THREE_STRIKE_PATH,
        JSON.stringify({ count: 2, lastFailure: "2026-05-28T00:00:00Z" }),
      );
      expect(await shouldClearGoal(ROOT)).toBe(false);
    });

    it("returns false when file is missing", async () => {
      if (existsSync(THREE_STRIKE_PATH)) {
        rmSync(THREE_STRIKE_PATH);
      }
      expect(await shouldClearGoal(ROOT)).toBe(false);
    });
  });

  describe("setGoal", () => {
    it("outputs instruction to stdout (does not throw)", async () => {
      const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      await setGoal("完成 plan→build→review→test→ship 流程");
      expect(spy).toHaveBeenCalled();
      const output = spy.mock.calls.map((args) => args.join(" ")).join("\n");
      expect(output).toContain("/goal");
      spy.mockRestore();
    });
  });

  describe("clearGoal", () => {
    it("outputs instruction to stdout (does not throw)", async () => {
      const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      await clearGoal();
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
