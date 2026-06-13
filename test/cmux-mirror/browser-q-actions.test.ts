import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../scripts/cmux-mirror/lib/cli.mjs", () => ({
  runCli: vi.fn(async () => ({ exitCode: 0, stdout: "ok", stderr: "" })),
}));

vi.mock("../../scripts/cmux-mirror/lib/availability.mjs", () => ({
  cmuxAvailable: vi.fn(() => true),
}));

import {
  buildConsoleArgs,
  buildErrorsArgs,
  buildFocusWebviewArgs,
  buildScreenshotArgs,
  injectSurface,
} from "../../scripts/cmux-mirror/lib/browser-q-actions.mjs";
import { collectBrowserDiagnostics } from "../../scripts/cmux-mirror/browser-qa.mjs";
import { cmuxAvailable } from "../../scripts/cmux-mirror/lib/availability.mjs";
import { runCli } from "../../scripts/cmux-mirror/lib/cli.mjs";

const mockedRunCli = vi.mocked(runCli);
const mockedAvailable = vi.mocked(cmuxAvailable);
const TMP_DIR = join(process.cwd(), "test", ".browser-q-actions-tmp");

afterEach(() => {
  vi.clearAllMocks();
  mockedRunCli.mockResolvedValue({ exitCode: 0, stdout: "ok", stderr: "" });
  mockedAvailable.mockReturnValue(true);
  if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true });
});

describe("browser-q-actions: argv builders (grounded on `cmux browser --help`)", () => {
  it("buildScreenshotArgs emits `browser screenshot --out <path>`", () => {
    const args = buildScreenshotArgs({ outPath: "/tmp/shot.png" });
    expect(args).toEqual(["browser", "screenshot", "--out", "/tmp/shot.png"]);
  });

  it("buildScreenshotArgs rejects a traversal path (injection guard)", () => {
    expect(() => buildScreenshotArgs({ outPath: "../etc/passwd" })).toThrow();
    expect(() => buildScreenshotArgs({ outPath: "/tmp/../etc/x" })).toThrow();
  });

  it("buildConsoleArgs emits `browser console list` (0.64.15 view-action)", () => {
    expect(buildConsoleArgs()).toEqual(["browser", "console", "list"]);
  });

  it("buildErrorsArgs emits `browser errors list` (0.64.15 view-action)", () => {
    expect(buildErrorsArgs()).toEqual(["browser", "errors", "list"]);
  });

  it("buildFocusWebviewArgs emits `browser focus-webview` (0.64.13 focus primitive)", () => {
    expect(buildFocusWebviewArgs()).toEqual(["browser", "focus-webview"]);
  });
});

describe("injectSurface: optional surface handle", () => {
  it("returns args unchanged when no surface is given", () => {
    const args = buildConsoleArgs();
    expect(injectSurface(args, undefined)).toBe(args);
  });

  it("inserts `--surface <handle>` right after `browser`", () => {
    const args = injectSurface(buildScreenshotArgs({ outPath: "/x.png" }), "surface:1");
    expect(args).toEqual([
      "browser",
      "--surface",
      "surface:1",
      "screenshot",
      "--out",
      "/x.png",
    ]);
  });

  it("leaves non-browser argv untouched", () => {
    expect(injectSurface(["reorder-workspaces", "--order", "workspace:1"], "surface:1"))
      .toEqual(["reorder-workspaces", "--order", "workspace:1"]);
  });
});

describe("collectBrowserDiagnostics: read-only QA artifacts (R8 enhancement)", () => {
  it("no-ops when cmux unavailable (Zero-Impact)", async () => {
    mockedAvailable.mockReturnValue(false);
    const res = await collectBrowserDiagnostics({ forgeDir: TMP_DIR });
    expect(res.collected).toEqual([]);
    expect(res.dir).toBeNull();
  });

  it("no-ops when forgeDir is missing", async () => {
    const res = await collectBrowserDiagnostics({ forgeDir: join(TMP_DIR, "nope") });
    expect(res.collected).toEqual([]);
    expect(res.dir).toBeNull();
  });

  it("writes console/errors artifacts and passes the screenshot --out into the findings dir", async () => {
    mkdirSync(TMP_DIR, { recursive: true });
    mockedRunCli.mockImplementation(async (args) => {
      // Echo a distinct payload per step so we can assert file contents.
      const joined = (args as string[]).join(" ");
      if (joined.includes("console")) return { exitCode: 0, stdout: "[log] ready", stderr: "" };
      if (joined.includes("errors")) return { exitCode: 0, stdout: "[error] none", stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" }; // screenshot writes via --out
    });

    const res = await collectBrowserDiagnostics({ forgeDir: TMP_DIR, topic: "t1" });

    expect(res.collected).toEqual(expect.arrayContaining(["screenshot", "console", "errors"]));
    expect(res.dir).toBe(join(TMP_DIR, "findings", "t1", "browser-qa"));

    expect(readFileSync(join(res.dir!, "console.txt"), "utf-8")).toBe("[log] ready");
    expect(readFileSync(join(res.dir!, "errors.txt"), "utf-8")).toBe("[error] none");

    // The screenshot call must target the findings dir (cmux writes the PNG itself).
    const shotCall = mockedRunCli.mock.calls.find((c) =>
      (c[0] as string[]).includes("screenshot"),
    );
    expect(shotCall?.[0]).toEqual(
      expect.arrayContaining(["screenshot", "--out", join(res.dir!, "screenshot.png")]),
    );
  });

  it("skips an unsupported view-action without aborting the others", async () => {
    mkdirSync(TMP_DIR, { recursive: true });
    mockedRunCli.mockImplementation(async (args) => {
      const joined = (args as string[]).join(" ");
      if (joined.includes("console")) {
        return { exitCode: 1, stdout: "", stderr: "unknown command: console" };
      }
      return { exitCode: 0, stdout: "ok", stderr: "" };
    });

    const res = await collectBrowserDiagnostics({ forgeDir: TMP_DIR, topic: "t2" });
    expect(res.skipped.some((s) => s.kind === "console" && s.reason === "unsupported")).toBe(true);
    expect(res.collected).toEqual(expect.arrayContaining(["screenshot", "errors"]));
    expect(res.collected).not.toContain("console");
  });

  it("never throws — cmux errors degrade to skipped, not exceptions", async () => {
    mkdirSync(TMP_DIR, { recursive: true });
    mockedRunCli.mockRejectedValue(new Error("boom"));
    const res = await collectBrowserDiagnostics({ forgeDir: TMP_DIR });
    expect(res.collected).toEqual([]);
    // Every step recorded as skipped/error, no throw.
    expect(res.skipped.length).toBeGreaterThan(0);
  });
});
