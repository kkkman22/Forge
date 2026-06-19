import { describe, expect, it } from "vitest";
import { classifyPrompt, extractForgeSubcommand } from "../scripts/record-prompt-metrics.mjs";

describe("record-prompt-metrics prompt parsing", () => {
  describe("extractForgeSubcommand", () => {
    it("extracts /forge <sub> slash subcommand", () => {
      expect(extractForgeSubcommand("/forge build")).toBe("build");
      expect(extractForgeSubcommand("/forge plan")).toBe("plan");
      expect(extractForgeSubcommand("/forge ship")).toBe("ship");
    });

    it("extracts subcommand with trailing args", () => {
      expect(extractForgeSubcommand("/forge spec api-spec.yaml")).toBe("spec");
      expect(extractForgeSubcommand("/forge build --package auth")).toBe("build");
    });

    it("extracts subcommand with leading/trailing whitespace", () => {
      expect(extractForgeSubcommand("  /forge review  ")).toBe("review");
    });

    it("returns null for non-forge slash commands", () => {
      expect(extractForgeSubcommand("/help")).toBeNull();
      expect(extractForgeSubcommand("/clear")).toBeNull();
      expect(extractForgeSubcommand("/compact")).toBeNull();
    });

    it("returns null for bare /forge (no subcommand)", () => {
      expect(extractForgeSubcommand("/forge")).toBeNull();
      expect(extractForgeSubcommand("/forge ")).toBeNull();
    });

    it("returns null for natural language without slash", () => {
      expect(extractForgeSubcommand("fix the login bug")).toBeNull();
      expect(extractForgeSubcommand("为用户 API 添加分页")).toBeNull();
    });

    it("returns null for empty or undefined", () => {
      expect(extractForgeSubcommand("")).toBeNull();
      expect(extractForgeSubcommand(undefined as unknown as string)).toBeNull();
    });

    it("does not match forge inside other words", () => {
      expect(extractForgeSubcommand("/forgebuild something")).toBeNull();
    });
  });

  describe("classifyPrompt", () => {
    it("classifies forge slash prompt as {kind: 'slash', skill}", () => {
      const result = classifyPrompt("/forge grill");
      expect(result.kind).toBe("slash");
      expect(result.skill).toBe("forge-grill");
    });

    it("classifies bare /forge (router path) as {kind: 'natural', skill: 'forge-router'}", () => {
      const result = classifyPrompt("/forge 添加分页功能");
      expect(result.kind).toBe("natural");
      expect(result.skill).toBe("forge-router");
    });

    it("classifies non-forge prompt as {kind: 'other', skill: null}", () => {
      const result = classifyPrompt("explain this code");
      expect(result.kind).toBe("other");
      expect(result.skill).toBeNull();
    });

    it("classifies empty prompt as {kind: 'other', skill: null}", () => {
      const result = classifyPrompt("");
      expect(result.kind).toBe("other");
      expect(result.skill).toBeNull();
    });
  });
});
