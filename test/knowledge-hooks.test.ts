import { describe, expect, it } from "vitest";
import {
  hashEvent,
  isCatalogStale,
  isThrottled,
  type KnowledgeEvent,
  shouldTriggerEpisodeThreshold,
  THRESHOLD_MILESTONES,
} from "../src/knowledge-hooks.js";

describe("knowledge-hooks pure scheduling", () => {
  describe("hashEvent", () => {
    it("produces deterministic hash for same event", () => {
      const event: KnowledgeEvent = {
        kind: "adr_written",
        path: ".tinkerman/decisions/ADR-0042.md",
      };
      expect(hashEvent(event)).toBe(hashEvent(event));
    });

    it("produces different hash for different events", () => {
      const a: KnowledgeEvent = { kind: "adr_written", path: ".tinkerman/decisions/ADR-0042.md" };
      const b: KnowledgeEvent = { kind: "adr_written", path: ".tinkerman/decisions/ADR-0043.md" };
      expect(hashEvent(a)).not.toBe(hashEvent(b));
    });

    it("produces different hash for same path but different kind", () => {
      const a: KnowledgeEvent = { kind: "adr_written", path: "x" };
      const b: KnowledgeEvent = { kind: "solution_written", topic: "x", path: "x" };
      expect(hashEvent(a)).not.toBe(hashEvent(b));
    });
  });

  describe("isThrottled", () => {
    it("returns false for new event hash", () => {
      const hashes = new Set<string>();
      expect(isThrottled({ kind: "adr_written", path: "x" }, hashes, 5000)).toBe(false);
    });

    it("returns true for recently seen event hash", () => {
      const event: KnowledgeEvent = { kind: "adr_written", path: "x" };
      const hashes = new Set([hashEvent(event)]);
      expect(isThrottled(event, hashes, 5000)).toBe(true);
    });

    it("returns false for different event kind same path", () => {
      const hashes = new Set([hashEvent({ kind: "adr_written", path: "x" })]);
      expect(isThrottled({ kind: "solution_written", topic: "x", path: "x" }, hashes, 5000)).toBe(
        false,
      );
    });
  });

  describe("isCatalogStale", () => {
    it("returns true when input files are newer than catalog", () => {
      expect(isCatalogStale(1000, [2000, 1500])).toBe(true);
    });

    it("returns false when catalog is newer than all inputs", () => {
      expect(isCatalogStale(3000, [2000, 1500])).toBe(false);
    });

    it("returns false when no input files", () => {
      expect(isCatalogStale(1000, [])).toBe(false);
    });

    it("returns false when equal mtime", () => {
      expect(isCatalogStale(1000, [1000])).toBe(false);
    });
  });

  describe("shouldTriggerEpisodeThreshold", () => {
    it("returns milestone when crossing 5", () => {
      expect(shouldTriggerEpisodeThreshold(4, 5)).toBe(5);
    });

    it("returns null when not crossing any milestone", () => {
      expect(shouldTriggerEpisodeThreshold(6, 7)).toBeNull();
    });

    it("returns milestone when crossing 10", () => {
      expect(shouldTriggerEpisodeThreshold(9, 10)).toBe(10);
    });

    it("returns null when both below first milestone", () => {
      expect(shouldTriggerEpisodeThreshold(2, 3)).toBeNull();
    });

    it("returns first crossed milestone when jumping multiple", () => {
      expect(shouldTriggerEpisodeThreshold(3, 25)).toBe(5);
    });
  });

  describe("THRESHOLD_MILESTONES", () => {
    it("matches spec definition", () => {
      expect(THRESHOLD_MILESTONES).toEqual([5, 10, 25, 50, 100, 250]);
    });
  });
});
