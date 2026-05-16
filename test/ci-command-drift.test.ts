import { describe, expect, it } from "vitest";
import { detectCiCommandDrift } from "../src/ci-command-drift.js";

describe("detectCiCommandDrift", () => {
  // Case 1: frontmatter has ci_check_command → always has_ci_command
  it("returns has_ci_command when frontmatter has ci_check_command set", () => {
    const result = detectCiCommandDrift(
      { ci_check_command: "npm run check" },
      '{"scripts":{"check":"npm run check"}}',
    );
    expect(result.kind).toBe("has_ci_command");
    if (result.kind === "has_ci_command") {
      expect(result.command).toBe("npm run check");
    }
  });

  // Case 1b: ci_check_command takes priority even with weird package.json
  it("returns has_ci_command regardless of packageJson when ci_check_command set", () => {
    const result = detectCiCommandDrift({ ci_check_command: "npm run check" }, "not json at all");
    expect(result.kind).toBe("has_ci_command");
  });

  // Case 2: no field, but package.json has scripts.check → drift
  it("returns drift_with_npm_check when no field but package.json has scripts.check", () => {
    const result = detectCiCommandDrift({}, '{"scripts":{"check":"npm run check"}}');
    expect(result.kind).toBe("drift_with_npm_check");
    if (result.kind === "drift_with_npm_check") {
      expect(result.suggestedCommand).toBe("npm run check");
      expect(result.warning).toContain("ci_check_command");
      expect(result.warning).toContain("npm run check");
    }
  });

  // Case 3: no field, empty package.json → no_check_no_field
  it("returns no_check_no_field when no field and empty scripts", () => {
    const result = detectCiCommandDrift({}, "{}");
    expect(result.kind).toBe("no_check_no_field");
  });

  // Case 4: no field, null packageJson → no_check_no_field
  it("returns no_check_no_field when no field and null packageJson", () => {
    const result = detectCiCommandDrift({}, null);
    expect(result.kind).toBe("no_check_no_field");
  });

  // Case 5: no field, malformed JSON → malformed_package_json
  it("returns malformed_package_json when packageJson is invalid JSON", () => {
    const result = detectCiCommandDrift({}, "{ broken json");
    expect(result.kind).toBe("malformed_package_json");
    if (result.kind === "malformed_package_json") {
      expect(result.reason).toBeTruthy();
    }
  });

  // Case 6: empty string ci_check_command → treated as missing → drift
  it("returns drift_with_npm_check when ci_check_command is empty string", () => {
    const result = detectCiCommandDrift(
      { ci_check_command: "" },
      '{"scripts":{"check":"npm run check"}}',
    );
    expect(result.kind).toBe("drift_with_npm_check");
  });

  // Case 7: whitespace-only ci_check_command → treated as missing → drift
  it("returns drift_with_npm_check when ci_check_command is whitespace only", () => {
    const result = detectCiCommandDrift(
      { ci_check_command: "   " },
      '{"scripts":{"check":"npm run check"}}',
    );
    expect(result.kind).toBe("drift_with_npm_check");
  });
});
