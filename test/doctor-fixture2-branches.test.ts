import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildHealthSnapshot, renderStatusSummary } from "../src/doctor.js";
import { checkPolicyProfileArtifactGate } from "../src/ship-gates.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "doc-fix2-"));
  mkdirSync(join(tmp, ".forge"), { recursive: true });
  mkdirSync(join(tmp, "scripts"), { recursive: true });
  for (const f of ["forge-hook-dispatch.mjs", "forge-phase-worker.mjs", "forge-sync-runtime.mjs"]) {
    writeFileSync(join(tmp, "scripts", f), "// runtime\n");
  }
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function wForge(rel: string, content: string): void {
  const full = join(tmp, ".forge", rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content, "utf-8");
}

describe("buildHealthSnapshot: tool health + worktree branches", () => {
  it("reports tool health unknown when no tool-health.md", () => {
    wForge("status.md", '---\ncurrent_task: "x"\ntier: "standard"\nphase: "build"\n---\n');
    const snap = buildHealthSnapshot({ projectRoot: tmp, currentHead: "h" });
    expect(snap.toolHealth.status).toBe("unknown");
  });
  it("reports tool health pass when tool-health.md exists", () => {
    wForge("status.md", '---\ncurrent_task: "x"\ntier: "standard"\nphase: "build"\n---\n');
    wForge("knowledge/tool-health.md", "# Tool Health\n");
    const snap = buildHealthSnapshot({ projectRoot: tmp, currentHead: "h" });
    expect(snap.toolHealth.status).toBe("pass");
  });
  it("handles status.md with missing fields (returns null → unknown task)", () => {
    wForge("status.md", "---\n---\n");
    const snap = buildHealthSnapshot({ projectRoot: tmp, currentHead: "h" });
    expect(snap.task.id).toBe("unknown");
  });
  it("handles missing status.md entirely", () => {
    const snap = buildHealthSnapshot({ projectRoot: tmp, currentHead: "h" });
    expect(snap.task.id).toBe("unknown");
  });
  it("reads task_type + project_phase from status", () => {
    wForge(
      "status.md",
      '---\ncurrent_task: "x"\ntier: "standard"\nphase: "build"\ntask_type: "bugfix"\nproject_phase: "iteration"\n---\n',
    );
    const snap = buildHealthSnapshot({ projectRoot: tmp, currentHead: "h" });
    expect(snap.task.id).toBe("x");
  });
});

describe("checkPolicyProfileArtifactGate (fixture-based)", () => {
  it("passes for solo profile (no required artifacts)", () => {
    wForge("status.md", '---\ncurrent_task: "x"\ntier: "light"\nphase: "build"\n---\n');
    const r = checkPolicyProfileArtifactGate(tmp, "x", "head-1", "solo");
    expect(r).toBeDefined();
  });
  it("checks artifacts for enterprise profile", () => {
    wForge("status.md", '---\ncurrent_task: "x"\ntier: "full"\nphase: "build"\n---\n');
    const r = checkPolicyProfileArtifactGate(tmp, "x", "head-1", "enterprise");
    expect(r).toBeDefined();
  });
  it("checks artifacts for team profile", () => {
    wForge("status.md", '---\ncurrent_task: "x"\ntier: "standard"\nphase: "ship"\n---\n');
    const r = checkPolicyProfileArtifactGate(tmp, "x", "head-1", "team");
    expect(r).toBeDefined();
  });
});
