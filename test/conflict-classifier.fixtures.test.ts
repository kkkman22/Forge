/**
 * Fixture tests for conflict-classifier — >= 80 paths across 4 zones.
 *
 * **Validates: Requirements R7.13, R7.1**
 */

import { describe, expect, it } from "vitest";
import { classify } from "../src/conflict-classifier.js";

const fixtures: [string, "frozen" | "guarded" | "open" | "source"][] = [
  // Frozen zone (21 paths)
  [".tinkerman/config.md", "frozen"],
  [".tinkerman/specs/auth/spec.md", "frozen"],
  [".tinkerman/specs/user-api/spec.md", "frozen"],
  [".tinkerman/specs/payment/spec.md", "frozen"],
  [".tinkerman/specs/notifications/spec.md", "frozen"],
  [".tinkerman/specs/search/spec.md", "frozen"],
  [".tinkerman/specs/a/spec.md", "frozen"],
  [".tinkerman/specs/b/spec.md", "frozen"],
  [".tinkerman/specs/c/spec.md", "frozen"],
  [".tinkerman/specs/d/spec.md", "frozen"],
  [".tinkerman/specs/e/spec.md", "frozen"],
  [".tinkerman/plans/auth.md", "frozen"],
  [".tinkerman/plans/user-api.md", "frozen"],
  [".tinkerman/plans/payment.md", "frozen"],
  [".tinkerman/plans/notifications.md", "frozen"],
  [".tinkerman/plans/search.md", "frozen"],
  [".tinkerman/plans/a.md", "frozen"],
  [".tinkerman/plans/b.md", "frozen"],
  [".tinkerman/plans/c.md", "frozen"],
  [".tinkerman/plans/d.md", "frozen"],
  [".tinkerman/plans/e.md", "frozen"],

  // Frozen zone: three-file layout (T-09.1)
  [".tinkerman/specs/auth/requirements.md", "frozen"],
  [".tinkerman/specs/auth/design.md", "frozen"],
  [".tinkerman/specs/auth/tasks.md", "frozen"],
  [".tinkerman/specs/user-api/requirements.md", "frozen"],
  [".tinkerman/specs/user-api/design.md", "frozen"],
  [".tinkerman/specs/user-api/tasks.md", "frozen"],
  [".tinkerman/specs/payment/bugfix.md", "frozen"],

  // Open zone: legacy backup files (not frozen)
  [".tinkerman/specs/auth/spec.legacy.md", "open"],

  // Guarded zone (21 paths)
  [".tinkerman/progress/auth.md", "guarded"],
  [".tinkerman/progress/user-api.md", "guarded"],
  [".tinkerman/progress/payment.md", "guarded"],
  [".tinkerman/progress/notifications.md", "guarded"],
  [".tinkerman/progress/search.md", "guarded"],
  [".tinkerman/reviews/auth.md", "guarded"],
  [".tinkerman/reviews/user-api.md", "guarded"],
  [".tinkerman/reviews/payment.md", "guarded"],
  [".tinkerman/reviews/notifications.md", "guarded"],
  [".tinkerman/reviews/search.md", "guarded"],
  [".tinkerman/knowledge/instincts.md", "guarded"],
  [".tinkerman/knowledge/known-failures.md", "guarded"],
  [".tinkerman/knowledge/solutions/auth-error.md", "guarded"],
  [".tinkerman/knowledge/solutions/db-migration.md", "guarded"],
  [".tinkerman/knowledge/solutions/race-condition.md", "guarded"],
  [".tinkerman/decisions/ADR-001-use-postgres.md", "guarded"],
  [".tinkerman/decisions/ADR-002-monorepo-structure.md", "guarded"],
  [".tinkerman/decisions/ADR-003-auth-strategy.md", "guarded"],
  [".tinkerman/decisions/ADR-004-caching.md", "guarded"],
  [".tinkerman/decisions/ADR-005-error-handling.md", "guarded"],
  [".tinkerman/decisions/ADR-010-logging-framework.md", "guarded"],

  // Open zone (21 paths)
  [".tinkerman/status.md", "open"],
  [".tinkerman/sessions/abc123.md", "open"],
  [".tinkerman/sessions/def456.md", "open"],
  [".tinkerman/findings/auth/output.log", "open"],
  [".tinkerman/findings/user-api/console.log", "open"],
  [".tinkerman/.locks/auth.lock", "open"],
  [".tinkerman/.locks/user-api.lock", "open"],
  [".tinkerman/reviews/auth.canvas.html", "guarded"],
  [".tinkerman/reviews/auth-checklist.md", "guarded"],
  [".tinkerman/ship/auth-post-push-verify.md", "open"],
  [".tinkerman/knowledge/tool-health.md", "open"],
  [".tinkerman/knowledge/evolved-rules.md", "open"],
  [".tinkerman/knowledge/sessions/abc.md", "open"],
  [".tinkerman/debug/unlock-1234567890.md", "open"],
  [".tinkerman/verify/auth/baseline/", "open"],
  [".tinkerman/verify/auth/treatment/", "open"],
  [".tinkerman/findings/auth/cli-harness/", "open"],
  [".tinkerman/findings/auth/ui-harness/", "open"],
  [".tinkerman/some-random-file.txt", "open"],
  [".tinkerman/another-file.md", "open"],
  [".tinkerman/nested/deep/file.json", "open"],
  [".tinkerman/temp-output.log", "open"],
  [".tinkerman/cache.json", "open"],
  [".tinkerman/features/structured-observability.md", "open"],
  [".tinkerman/features/agent-skills-learnings.md", "open"],

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
