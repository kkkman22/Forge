/**
 * Fixture tests for conflict-classifier — >= 80 paths across 4 zones.
 *
 * **Validates: Requirements R7.13, R7.1**
 */

import { describe, expect, it } from "vitest";
import { classify } from "../src/conflict-classifier.js";

const fixtures: [string, "frozen" | "guarded" | "open" | "source"][] = [
  // Frozen zone (21 paths)
  [".forge/config.md", "frozen"],
  [".forge/specs/auth/spec.md", "frozen"],
  [".forge/specs/user-api/spec.md", "frozen"],
  [".forge/specs/payment/spec.md", "frozen"],
  [".forge/specs/notifications/spec.md", "frozen"],
  [".forge/specs/search/spec.md", "frozen"],
  [".forge/specs/a/spec.md", "frozen"],
  [".forge/specs/b/spec.md", "frozen"],
  [".forge/specs/c/spec.md", "frozen"],
  [".forge/specs/d/spec.md", "frozen"],
  [".forge/specs/e/spec.md", "frozen"],
  [".forge/plans/auth.md", "frozen"],
  [".forge/plans/user-api.md", "frozen"],
  [".forge/plans/payment.md", "frozen"],
  [".forge/plans/notifications.md", "frozen"],
  [".forge/plans/search.md", "frozen"],
  [".forge/plans/a.md", "frozen"],
  [".forge/plans/b.md", "frozen"],
  [".forge/plans/c.md", "frozen"],
  [".forge/plans/d.md", "frozen"],
  [".forge/plans/e.md", "frozen"],

  // Frozen zone: three-file layout (T-09.1)
  [".forge/specs/auth/requirements.md", "frozen"],
  [".forge/specs/auth/design.md", "frozen"],
  [".forge/specs/auth/tasks.md", "frozen"],
  [".forge/specs/user-api/requirements.md", "frozen"],
  [".forge/specs/user-api/design.md", "frozen"],
  [".forge/specs/user-api/tasks.md", "frozen"],
  [".forge/specs/payment/bugfix.md", "frozen"],

  // Open zone: legacy backup files (not frozen)
  [".forge/specs/auth/spec.legacy.md", "open"],

  // Guarded zone (21 paths)
  [".forge/progress/auth.md", "guarded"],
  [".forge/progress/user-api.md", "guarded"],
  [".forge/progress/payment.md", "guarded"],
  [".forge/progress/notifications.md", "guarded"],
  [".forge/progress/search.md", "guarded"],
  [".forge/reviews/auth.md", "guarded"],
  [".forge/reviews/user-api.md", "guarded"],
  [".forge/reviews/payment.md", "guarded"],
  [".forge/reviews/notifications.md", "guarded"],
  [".forge/reviews/search.md", "guarded"],
  [".forge/knowledge/instincts.md", "guarded"],
  [".forge/knowledge/known-failures.md", "guarded"],
  [".forge/knowledge/solutions/auth-error.md", "guarded"],
  [".forge/knowledge/solutions/db-migration.md", "guarded"],
  [".forge/knowledge/solutions/race-condition.md", "guarded"],
  [".forge/decisions/ADR-001-use-postgres.md", "guarded"],
  [".forge/decisions/ADR-002-monorepo-structure.md", "guarded"],
  [".forge/decisions/ADR-003-auth-strategy.md", "guarded"],
  [".forge/decisions/ADR-004-caching.md", "guarded"],
  [".forge/decisions/ADR-005-error-handling.md", "guarded"],
  [".forge/decisions/ADR-010-logging-framework.md", "guarded"],

  // Open zone (21 paths)
  [".forge/status.md", "open"],
  [".forge/sessions/abc123.md", "open"],
  [".forge/sessions/def456.md", "open"],
  [".forge/findings/auth/output.log", "open"],
  [".forge/findings/user-api/console.log", "open"],
  [".forge/.locks/auth.lock", "open"],
  [".forge/.locks/user-api.lock", "open"],
  [".forge/reviews/auth.canvas.html", "guarded"],
  [".forge/reviews/auth-checklist.md", "guarded"],
  [".forge/ship/auth-post-push-verify.md", "open"],
  [".forge/knowledge/tool-health.md", "open"],
  [".forge/knowledge/evolved-rules.md", "open"],
  [".forge/knowledge/sessions/abc.md", "open"],
  [".forge/debug/unlock-1234567890.md", "open"],
  [".forge/verify/auth/baseline/", "open"],
  [".forge/verify/auth/treatment/", "open"],
  [".forge/findings/auth/cli-harness/", "open"],
  [".forge/findings/auth/ui-harness/", "open"],
  [".forge/some-random-file.txt", "open"],
  [".forge/another-file.md", "open"],
  [".forge/nested/deep/file.json", "open"],
  [".forge/temp-output.log", "open"],
  [".forge/cache.json", "open"],
  [".forge/features/structured-observability.md", "open"],
  [".forge/features/agent-skills-learnings.md", "open"],

  // Source zone (21 paths)
  ["src/index.ts", "source"],
  ["src/auth/login.ts", "source"],
  ["src/auth/register.ts", "source"],
  ["src/api/users.ts", "source"],
  ["src/api/orders.ts", "source"],
  ["src/db/models.ts", "source"],
  ["src/db/migrations/001.ts", "source"],
  ["test/auth.test.ts", "source"],
  ["test/api.test.ts", "source"],
  ["test/db.test.ts", "source"],
  ["package.json", "source"],
  ["tsconfig.json", "source"],
  ["README.md", "source"],
  [".gitignore", "source"],
  [".eslintrc.json", "source"],
  ["biome.json", "source"],
  ["scripts/build.sh", "source"],
  ["scripts/test.sh", "source"],
  ["docs/api.md", "source"],
  ["docs/architecture.md", "source"],
  ["rules/no-any-cast.md", "source"],
];

describe("conflict-classifier fixture test [R7.13]", () => {
  it(`classifies ${fixtures.length} paths correctly`, () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(80);

    for (const [path, expectedZone] of fixtures) {
      const actual = classify(path);
      expect(actual).toBe(expectedZone);
    }
  });

  it("has >= 20 paths per zone", () => {
    const counts = { frozen: 0, guarded: 0, open: 0, source: 0 };
    for (const [, zone] of fixtures) {
      counts[zone]++;
    }
    for (const [zone, count] of Object.entries(counts)) {
      expect(count, `Zone ${zone} should have >= 20 fixtures`).toBeGreaterThanOrEqual(20);
    }
  });
});
