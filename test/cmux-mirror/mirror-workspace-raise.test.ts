import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the raise so we can assert the daemon calls it without touching cmux.
// vi.hoisted lifts the reference above the hoisted vi.mock factory (avoids TDZ).
const { raiseMock } = vi.hoisted(() => ({
  raiseMock: vi.fn(async () => ({ applied: false, reason: "unsupported" })),
}));
vi.mock("../../scripts/cmux-mirror/lib/workspace-reorder.mjs", () => ({
  raiseActiveWorkspace: raiseMock,
}));

import { createMirrorDaemon } from "../../scripts/cmux-mirror/mirror.mjs";

describe("mirror: raises active workspace on startup (cmux 0.64.10+)", () => {
  let dir: string;
  let origEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cmux-raise-test-"));
    origEnv = { ...process.env };
    raiseMock.mockClear();
    raiseMock.mockResolvedValue({ applied: false, reason: "unsupported" });
  });

  afterEach(() => {
    process.env = origEnv;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  function seedForge() {
    const forgeDir = join(dir, "forge");
    mkdirSync(forgeDir, { recursive: true });
    mkdirSync(join(forgeDir, "progress"), { recursive: true });
    writeFileSync(
      join(forgeDir, "status.md"),
      ["---", 'project_phase: "build"', "---", "", "# Status"].join("\n"),
    );
    return forgeDir;
  }

  it("invokes raiseActiveWorkspace with CMUX_WORKSPACE_ID when running inside cmux", async () => {
    process.env.CMUX_WORKSPACE_ID = "workspace:7";
    const forgeDir = seedForge();

    const result = await createMirrorDaemon({
      forgeDir,
      socketDir: dir,
      cmuxAvailable: true,
    });

    expect(raiseMock).toHaveBeenCalledTimes(1);
    expect(raiseMock).toHaveBeenCalledWith(
      expect.objectContaining({ activeRef: "workspace:7" }),
    );
    if (result.started) await result.shutdown();
  });

  it("still calls raise (which no-ops internally) when no workspace ref is set", async () => {
    delete process.env.CMUX_WORKSPACE_ID;
    const forgeDir = seedForge();

    const result = await createMirrorDaemon({
      forgeDir,
      socketDir: dir,
      cmuxAvailable: true,
    });

    // Daemon delegates the no-op decision to raiseActiveWorkspace itself.
    expect(raiseMock).toHaveBeenCalledWith(expect.objectContaining({ activeRef: "" }));
    if (result.started) await result.shutdown();
  });
});
