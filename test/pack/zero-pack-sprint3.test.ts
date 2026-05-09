/**
 * Sprint 3 zero-pack-invariant extensions.
 *
 * When no packs are enabled, all Sprint 3 subsystems must return empty /
 * no-op results just like Sprint 1 and Sprint 2 modules.
 *
 * **Validates**: R12 Zero-Pack-Zero-Impact invariant (Sprint 3 scope)
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveFileContext } from "../../src/context-boundary.js";
import { applyLintRulesToFile, loadPackLintRules } from "../../src/lint/pack-rules.js";
import { generateLivingDoc } from "../../src/living-doc/generator.js";
import { shouldTriggerBusinessAnalyst } from "../../src/spec.js";

describe("Sprint 3 — Zero-Pack-Zero-Impact invariant", () => {
  // ------------------------------------------------------------------
  // 1. business-analyst not triggered without pack
  // ------------------------------------------------------------------
  describe("shouldTriggerBusinessAnalyst", () => {
    it("returns false when context is provided but no packs are enabled", () => {
      expect(shouldTriggerBusinessAnalyst("reservations", [])).toBe(false);
    });

    it("returns false when context is undefined", () => {
      expect(shouldTriggerBusinessAnalyst(undefined, [])).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // 2. context boundary hook no-ops without ownership map
  // ------------------------------------------------------------------
  describe("resolveFileContext", () => {
    it("returns null when ownership map is empty and no jsdoc context", () => {
      const result = resolveFileContext("src/domain/reservation/reservation.ts", {}, null);
      expect(result).toBeNull();
    });
  });

  // ------------------------------------------------------------------
  // 3. money/time lint rules not loaded without pack
  // ------------------------------------------------------------------
  describe("pack lint rules", () => {
    it("loadPackLintRules returns empty array for non-existent manifest path", () => {
      const rules = loadPackLintRules("/nonexistent/pack/root", "lint/manifest.yaml");
      expect(rules).toEqual([]);
    });

    it("applyLintRulesToFile returns empty findings with empty rules array", () => {
      const findings = applyLintRulesToFile(
        "src/domain/money.ts",
        'const price = new Money(100, "USD");',
        [],
      );
      expect(findings).toEqual([]);
    });
  });

  // ------------------------------------------------------------------
  // 4. living doc generates empty skeleton without specs
  // ------------------------------------------------------------------
  describe("generateLivingDoc", () => {
    it("returns LivingDocData with 0 scenarios and 0 contexts for empty directories", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-livingdoc-"));

      try {
        const specsDir = path.join(tmpDir, "specs");
        fs.mkdirSync(specsDir);

        const result = generateLivingDoc(specsDir, null);

        expect(result.globalStats.totalScenarios).toBe(0);
        expect(result.globalStats.pass).toBe(0);
        expect(result.globalStats.fail).toBe(0);
        expect(result.globalStats.pending).toBe(0);
        expect(result.contexts.size).toBe(0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  // ------------------------------------------------------------------
  // 5. DDD tactical templates not auto-referenced without pack
  // ------------------------------------------------------------------
  describe("DDD tactical templates (core layer)", () => {
    const templatesDir = path.resolve(import.meta.dirname, "../../templates/ddd");

    it("core templates/ddd directory exists and has template files", () => {
      expect(fs.existsSync(templatesDir)).toBe(true);
      const files = fs.readdirSync(templatesDir);
      // Core layer always provides generic DDD templates
      expect(files.length).toBeGreaterThan(0);
    });

    it("core templates are generic — no PMS-specific .ts.template files", () => {
      const tsTemplates = fs.readdirSync(templatesDir).filter((f) => f.endsWith(".ts.template"));

      // Read each template and verify no PMS-specific domain types
      const pmsKeywords = [
        "Reservation",
        "Guest",
        "RoomType",
        "Hotel",
        "Booking",
        "CheckIn",
        "CheckOut",
        "Folio",
      ];
      for (const tpl of tsTemplates) {
        const content = fs.readFileSync(path.join(templatesDir, tpl), "utf-8");
        for (const kw of pmsKeywords) {
          // Mustache placeholders like {{AggregateName}} are fine —
          // concrete PMS types in code are not.
          expect(content).not.toContain(`class ${kw}`);
        }
      }
    });
  });
});
