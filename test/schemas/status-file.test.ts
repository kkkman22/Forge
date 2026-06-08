import { describe, expect, it } from "vitest";

import {
  type SafeParseResult,
  type StatusFile,
  safeParseStatusFile,
} from "../../src/schemas/status-file.js";

describe("StatusFileSchema", () => {
  describe("work_nature field", () => {
    it("accepts valid work_nature: feature", () => {
      const result = safeParseStatusFile({ work_nature: "feature" });
      expect(result.errors).toHaveLength(0);
      expect(result.value.work_nature).toBe("feature");
    });

    it("accepts valid work_nature: refactor", () => {
      const result = safeParseStatusFile({ work_nature: "refactor" });
      expect(result.errors).toHaveLength(0);
      expect(result.value.work_nature).toBe("refactor");
    });

    it("accepts valid work_nature: bugfix", () => {
      const result = safeParseStatusFile({ work_nature: "bugfix" });
      expect(result.errors).toHaveLength(0);
      expect(result.value.work_nature).toBe("bugfix");
    });

    it("rejects invalid work_nature value", () => {
      const result = safeParseStatusFile({ work_nature: "invalid" });
      expect(result.errors.length).toBeGreaterThan(0);
      // Partial extraction drops the invalid field
      expect(result.value.work_nature).toBeUndefined();
    });

    it("accepts absence of work_nature (optional)", () => {
      const result = safeParseStatusFile({});
      expect(result.errors).toHaveLength(0);
      expect(result.value.work_nature).toBeUndefined();
    });
  });

  describe("PhaseSchema extended for WorkNature phases", () => {
    it("accepts phase: refactor-scan", () => {
      const result = safeParseStatusFile({ phase: "refactor-scan" });
      expect(result.errors).toHaveLength(0);
      expect(result.value.phase).toBe("refactor-scan");
    });

    it("accepts phase: refactor-apply", () => {
      const result = safeParseStatusFile({ phase: "refactor-apply" });
      expect(result.errors).toHaveLength(0);
      expect(result.value.phase).toBe("refactor-apply");
    });

    it("accepts phase: fix-analyze", () => {
      const result = safeParseStatusFile({ phase: "fix-analyze" });
      expect(result.errors).toHaveLength(0);
      expect(result.value.phase).toBe("fix-analyze");
    });

    it("accepts phase: fix-apply", () => {
      const result = safeParseStatusFile({ phase: "fix-apply" });
      expect(result.errors).toHaveLength(0);
      expect(result.value.phase).toBe("fix-apply");
    });

    it("rejects unknown phase values", () => {
      const result = safeParseStatusFile({ phase: "unknown-phase" });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.value.phase).toBeUndefined();
    });
  });
});
