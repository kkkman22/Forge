/**
 * Property-based tests for the Zod schemas in `src/schemas/`.
 *
 * Covers:
 *   - `StatusFileSchema` round-trips any object sampled from a matching
 *     arbitrary (parse ∘ serialize ≡ identity for known fields)
 *   - `ConfigFileSchema` round-trips any object sampled from a matching
 *     arbitrary
 *   - Passthrough behaviour: any unknown field on a well-formed input is
 *     preserved rather than rejected
 *
 * **Validates: Requirement 2.9**
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  ConfigFileSchema,
  StatusFileSchema,
  safeParseConfigFile,
  safeParseStatusFile,
} from "../src/schemas/index.js";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const phaseArb = fc.constantFrom(
  "decide",
  "spec",
  "plan",
  "build",
  "build-light",
  "review",
  "test",
  "ship",
  "learn",
  "debug",
  "fix",
  "refactor",
);

const tierArb = fc.constantFrom("light", "standard", "full");

const loopFieldsArb = fc.record(
  {
    mode: fc.constantFrom("interactive", "autonomous"),
    loop_run_id: fc.stringMatching(/^[a-z0-9-]{4,32}$/),
    loop_iteration: fc.integer({ min: 0, max: 1000 }),
  },
  { requiredKeys: ["mode", "loop_run_id", "loop_iteration"] },
);

const statusFileArb = fc.record(
  {
    schemaVersion: fc.integer({ min: 1, max: 5 }),
    current_task: fc.string({ maxLength: 80 }),
    tier: tierArb,
    task_type: fc.stringMatching(/^[a-z_]+$/),
    project_phase: fc.stringMatching(/^[a-z_]+$/),
    phase: phaseArb,
    hints: fc.string({ maxLength: 80 }),
    assumptions: fc.array(fc.string({ maxLength: 40 }), { maxLength: 5 }),
    updated: fc.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    loop_fields: loopFieldsArb,
  },
  { requiredKeys: [] },
);

const configFileArb = fc.record(
  {
    project: fc.string({ minLength: 1, maxLength: 40 }),
    stack: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
    security_level: fc.integer({ min: 0, max: 3 }),
    knowledge_limit: fc.integer({ min: 1, max: 500 }),
    max_parallel_agents: fc.integer({ min: 1, max: 10 }),
    restatement_interval: fc.integer({ min: 2, max: 10 }),
    event_log_retention_days: fc.integer({ min: 1, max: 365 }),
  },
  { requiredKeys: [] },
);

// ---------------------------------------------------------------------------
// Round-trip properties
// ---------------------------------------------------------------------------

describe("schemas — round-trip", () => {
  /**
   * **Validates: Requirement 2.9**
   *
   * For any object sampled from a StatusFile-shaped arbitrary, the
   * pipeline `value → JSON round-trip → safeParseStatusFile` yields a
   * result whose value equals the original modulo passthrough ordering.
   */
  it("StatusFileSchema round-trips any well-formed object", () => {
    fc.assert(
      fc.property(statusFileArb, (sample) => {
        const wireForm = JSON.parse(JSON.stringify(sample));
        const { value, errors } = safeParseStatusFile(wireForm);
        expect(errors).toEqual([]);
        // schemaVersion defaults to 1 when absent; account for the default
        // fill so the round-trip holds for samples that omit it.
        const expected = { schemaVersion: 1, ...sample };
        expect(value).toEqual(expected);
      }),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirement 2.9**
   */
  it("ConfigFileSchema round-trips any well-formed object", () => {
    fc.assert(
      fc.property(configFileArb, (sample) => {
        const wireForm = JSON.parse(JSON.stringify(sample));
        const { value, errors } = safeParseConfigFile(wireForm);
        expect(errors).toEqual([]);
        expect(value).toEqual(sample);
      }),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Passthrough properties
// ---------------------------------------------------------------------------

describe("schemas — passthrough unknown fields", () => {
  /**
   * **Validates: Requirement 2.7**
   *
   * Adding an unknown field to a valid StatusFile object must not cause
   * validation to fail, and the unknown field must appear in the
   * returned value.
   */
  it("StatusFileSchema preserves unknown fields", () => {
    fc.assert(
      fc.property(
        statusFileArb,
        fc.stringMatching(/^[a-z_]{3,20}$/),
        fc.string({ maxLength: 40 }),
        (sample, key, value) => {
          // Skip if the random key collides with a known field.
          const knownKeys = new Set([
            "current_task",
            "tier",
            "task_type",
            "project_phase",
            "phase",
            "hints",
            "assumptions",
            "updated",
            "loop_fields",
          ]);
          if (knownKeys.has(key)) return;
          // __proto__ cannot be set via object literal / spread in JS
          if (key === "__proto__") return;
          const augmented = { ...sample, [key]: value };
          const result = StatusFileSchema.safeParse(augmented);
          expect(result.success).toBe(true);
          if (result.success) {
            expect((result.data as Record<string, unknown>)[key]).toBe(value);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirement 2.7**
   */
  it("ConfigFileSchema preserves unknown fields", () => {
    fc.assert(
      fc.property(
        configFileArb,
        fc.stringMatching(/^[a-z_]{3,20}$/),
        fc.string({ maxLength: 40 }),
        (sample, key, value) => {
          const knownKeys = new Set([
            "project",
            "stack",
            "security_level",
            "knowledge_limit",
            "max_parallel_agents",
            "restatement_interval",
            "event_log_retention_days",
          ]);
          if (knownKeys.has(key)) return;
          // __proto__ cannot be set via object literal / spread in JS
          if (key === "__proto__") return;
          const augmented = { ...sample, [key]: value };
          const result = ConfigFileSchema.safeParse(augmented);
          expect(result.success).toBe(true);
          if (result.success) {
            expect((result.data as Record<string, unknown>)[key]).toBe(value);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
