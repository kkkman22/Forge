/**
 * Status Resolver Resilience tests — state reconstruction from git.
 *
 * Property 3: For any file list containing reviews/, inferred phase is at least "review".
 */

import { describe, expect, it } from "vitest";
import { reconstructStateFromGit } from "../src/status-resolver.js";

// ---------------------------------------------------------------------------
// reconstructStateFromGit
// ---------------------------------------------------------------------------

describe("reconstructStateFromGit", () => {
  it("returns 'router' when no .tinkerman/ files exist", () => {
    const result = reconstructStateFromGit([]);

    expect(result.inferredPhase).toBe("router");
    expect(result.confidence).toBe("low");
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it("infers 'plan' from plans/ files", () => {
    const files = ["plans/my-feature.md", "config.md"];

    const result = reconstructStateFromGit(files);

    expect(result.inferredPhase).toBe("plan");
    expect(result.confidence).toBe("medium");
  });

  it("infers 'build' from progress/ files", () => {
    const files = ["plans/my-feature.md", "progress/my-feature.md"];

    const result = reconstructStateFromGit(files);

    expect(result.inferredPhase).toBe("build");
    expect(result.confidence).toBe("high");
  });

  it("infers 'review' from reviews/ files", () => {
    const files = ["plans/my-feature.md", "progress/my-feature.md", "reviews/my-feature.md"];

    const result = reconstructStateFromGit(files);

    expect(result.inferredPhase).toBe("review");
    expect(result.confidence).toBe("high");
  });

  it("returns most advanced phase when multiple state dirs exist", () => {
    // reviews/ is more advanced than progress/ or plans/
    const files = ["reviews/my-feature.md", "progress/my-feature.md"];

    const result = reconstructStateFromGit(files);

    expect(result.inferredPhase).toBe("review");
  });

  it("ignores non-state files", () => {
    const files = ["status.md", "config.md", "knowledge/instincts.md"];

    const result = reconstructStateFromGit(files);

    expect(result.inferredPhase).toBe("router");
  });

  it("handles progress/ without plans/", () => {
    const files = ["progress/my-feature.md"];

    const result = reconstructStateFromGit(files);

    expect(result.inferredPhase).toBe("build");
    expect(result.confidence).toBe("high");
  });

  it("returns router for empty file list", () => {
    const result = reconstructStateFromGit([]);

    expect(result.inferredPhase).toBe("router");
    expect(result.confidence).toBe("low");
  });
});

// ---------------------------------------------------------------------------
// Property 3: Monotonicity
// ---------------------------------------------------------------------------

describe("reconstructStateFromGit — Property 3: monotonicity", () => {
  it("files containing reviews/ → inferred phase is at least 'review'", () => {
    const result = reconstructStateFromGit(["reviews/anything.md"]);

    expect(result.inferredPhase).toBe("review");
  });

  it("files containing progress/ but no reviews/ → inferred phase is at least 'build'", () => {
    const result = reconstructStateFromGit(["progress/task.md"]);

    expect(["build", "review"]).toContain(result.inferredPhase);
  });

  it("files containing plans/ but no progress/ or reviews/ → inferred phase is at least 'plan'", () => {
    const result = reconstructStateFromGit(["plans/task.md"]);

    expect(["plan", "build", "review"]).toContain(result.inferredPhase);
  });
});
