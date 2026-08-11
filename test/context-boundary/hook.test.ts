/**
 * Tests for the check-context-boundary.mjs PreToolUse hook script.
 *
 * Tests the hook script's exit behavior by spawning it as a child process
 * with temp-file fixtures for ownership maps, context maps, and file content.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SCRIPT_PATH = path.resolve(__dirname, "../../scripts/check-context-boundary.mjs");

const _FIXTURES_DIR = path.resolve(__dirname, "__fixtures_hook__");

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ctx-boundary-hook-"));
}

function writeToolInputFile(tempDir: string, filePath: string, content: string): string {
  const toolInput = {
    file_path: filePath,
    content,
  };
  const inputPath = path.join(tempDir, "tool-input.json");
  fs.writeFileSync(inputPath, JSON.stringify(toolInput));
  return inputPath;
}

function writeOwnershipMap(tempDir: string, map: Record<string, string>): void {
  const forgeDir = path.join(tempDir, ".tinkerman");
  fs.mkdirSync(forgeDir, { recursive: true });
  const lines = Object.entries(map).map(([k, v]) => `${k}: ${v}`);
  fs.writeFileSync(path.join(forgeDir, "context-ownership.yaml"), `${lines.join("\n")}\n`);
}

function writeContextMap(
  tempDir: string,
  edges: Array<{ source: string; target: string; type: string }>,
): void {
  const packsDir = path.join(tempDir, "packs", "default", "contexts");
  fs.mkdirSync(packsDir, { recursive: true });

  const lines = ["# Context Map", "edges:"];
  for (const e of edges) {
    lines.push(`  - from: ${e.source}`);
    lines.push(`    to: ${e.target}`);
    lines.push(`    type: ${e.type}`);
  }

  fs.writeFileSync(path.join(packsDir, "_map.yaml"), `${lines.join("\n")}\n`);
}

function runHook(tempDir: string, toolInputPath: string): { exitCode: number; stderr: string } {
  try {
    const stderr = execFileSync("node", [SCRIPT_PATH, "Write", toolInputPath], {
      cwd: tempDir,
      encoding: "utf-8",
      timeout: 5000,
    });
    return { exitCode: 0, stderr: stderr || "" };
  } catch (err: unknown) {
    const e = err as { status?: number; stderr?: string };
    return { exitCode: e.status ?? 1, stderr: e.stderr ?? "" };
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("check-context-boundary.mjs hook", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // --- Legal import (same context) ---

  it("allows import within the same context (exit 0)", () => {
    writeOwnershipMap(tempDir, {
      "src/domain/reservation/**": "reservations",
      "src/domain/billing/**": "billing",
    });

    const inputPath = writeToolInputFile(
      tempDir,
      "src/domain/reservation/services/booking.ts",
      'import { BookingRepo } from "./booking-repo";\n',
    );

    const result = runHook(tempDir, inputPath);
    expect(result.exitCode).toBe(0);
  });

  // --- Legal import (declared relationship) ---

  it("allows import with declared partnership relationship (exit 0)", () => {
    writeOwnershipMap(tempDir, {
      "src/domain/reservation/**": "reservations",
      "src/domain/guest/**": "guest-management",
    });
    writeContextMap(tempDir, [
      { source: "reservations", target: "guest-management", type: "partnership" },
    ]);

    const inputPath = writeToolInputFile(
      tempDir,
      "src/domain/reservation/services/booking.ts",
      'import { GuestInfo } from "../../guest/models/guest";\n',
    );

    const result = runHook(tempDir, inputPath);
    expect(result.exitCode).toBe(0);
  });

  // --- Illegal import (cross-context, undeclared) ---

  it("blocks import with undeclared cross-context dependency (exit 1)", () => {
    writeOwnershipMap(tempDir, {
      "src/domain/reservation/**": "reservations",
      "src/domain/billing/**": "billing",
    });
    // No context map — undeclared

    const inputPath = writeToolInputFile(
      tempDir,
      "src/domain/reservation/services/booking.ts",
      'import { Invoice } from "../../billing/models/invoice";\n',
    );

    const result = runHook(tempDir, inputPath);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Context Boundary Violation");
    expect(result.stderr).toContain("undeclared");
    expect(result.stderr).toContain("reservations");
    expect(result.stderr).toContain("billing");
  });

  // --- Illegal import (blocked relationship) ---

  it("blocks import with customer-supplier relationship (exit 1)", () => {
    writeOwnershipMap(tempDir, {
      "src/domain/reservation/**": "reservations",
      "src/domain/billing/**": "billing",
    });
    writeContextMap(tempDir, [
      { source: "reservations", target: "billing", type: "customer-supplier" },
    ]);

    const inputPath = writeToolInputFile(
      tempDir,
      "src/domain/reservation/services/booking.ts",
      'import { BillingService } from "../../billing/service";\n',
    );

    const result = runHook(tempDir, inputPath);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("customer-supplier");
    expect(result.stderr).toContain("ACL");
  });

  // --- No context map (no ownership map) ---

  it("allows all imports when no ownership map exists (exit 0)", () => {
    // No .tinkerman/context-ownership.yaml created

    const inputPath = writeToolInputFile(
      tempDir,
      "src/domain/reservation/services/booking.ts",
      'import { Invoice } from "../../billing/models/invoice";\n',
    );

    const result = runHook(tempDir, inputPath);
    expect(result.exitCode).toBe(0);
  });

  // --- Escape hatch comment ---

  it("allows cross-context import with escape hatch comment (exit 0)", () => {
    writeOwnershipMap(tempDir, {
      "src/domain/reservation/**": "reservations",
      "src/domain/billing/**": "billing",
    });
    writeContextMap(tempDir, [
      { source: "reservations", target: "billing", type: "customer-supplier" },
    ]);

    const inputPath = writeToolInputFile(
      tempDir,
      "src/domain/reservation/services/booking.ts",
      [
        "// @forge:allow-cross-context legacy billing integration",
        'import { LegacyBilling } from "../../billing/legacy";',
        "",
      ].join("\n"),
    );

    const result = runHook(tempDir, inputPath);
    expect(result.exitCode).toBe(0);
  });

  // --- File outside src/ ---

  it("skips files outside src/ directory (exit 0)", () => {
    writeOwnershipMap(tempDir, {
      "src/domain/reservation/**": "reservations",
      "src/domain/billing/**": "billing",
    });

    const inputPath = writeToolInputFile(
      tempDir,
      "test/some-test.ts",
      'import { Invoice } from "../src/domain/billing/models/invoice";\n',
    );

    const result = runHook(tempDir, inputPath);
    expect(result.exitCode).toBe(0);
  });

  // --- Non-TypeScript file ---

  it("skips non-TypeScript files (exit 0)", () => {
    writeOwnershipMap(tempDir, {
      "src/domain/reservation/**": "reservations",
      "src/domain/billing/**": "billing",
    });

    const inputPath = writeToolInputFile(
      tempDir,
      "src/domain/reservation/config.yaml",
      "key: value\n",
    );

    const result = runHook(tempDir, inputPath);
    expect(result.exitCode).toBe(0);
  });

  // --- Package imports (non-relative) ---

  it("allows package (non-relative) imports (exit 0)", () => {
    writeOwnershipMap(tempDir, {
      "src/domain/reservation/**": "reservations",
    });

    const inputPath = writeToolInputFile(
      tempDir,
      "src/domain/reservation/services/booking.ts",
      ['import { z } from "zod";', 'import * as fs from "fs";', ""].join("\n"),
    );

    const result = runHook(tempDir, inputPath);
    expect(result.exitCode).toBe(0);
  });

  // --- Edit tool ---

  it("works with Edit tool input format (exit 1 for violation)", () => {
    writeOwnershipMap(tempDir, {
      "src/domain/reservation/**": "reservations",
      "src/domain/billing/**": "billing",
    });

    // Edit tool input format uses new_string instead of content
    const toolInput = {
      file_path: "src/domain/reservation/services/booking.ts",
      new_string: 'import { Invoice } from "../../billing/models/invoice";\n',
    };
    const inputPath = path.join(tempDir, "tool-input.json");
    fs.writeFileSync(inputPath, JSON.stringify(toolInput));

    try {
      const _stderr = execFileSync("node", [SCRIPT_PATH, "Edit", inputPath], {
        cwd: tempDir,
        encoding: "utf-8",
        timeout: 5000,
      });
      // Should not reach here
      expect(true).toBe(false);
    } catch (err: unknown) {
      const e = err as { status?: number; stderr?: string };
      expect(e.status).toBe(1);
      expect(e.stderr).toContain("Context Boundary Violation");
    }
  });

  // --- Structured error message format ---

  it("produces structured error message with line, contexts, and suggestion", () => {
    writeOwnershipMap(tempDir, {
      "src/domain/reservation/**": "reservations",
      "src/domain/billing/**": "billing",
    });

    const inputPath = writeToolInputFile(
      tempDir,
      "src/domain/reservation/services/booking.ts",
      'import { Invoice } from "../../billing/models/invoice";\n',
    );

    const result = runHook(tempDir, inputPath);
    expect(result.exitCode).toBe(1);

    // Verify structured message parts
    expect(result.stderr).toContain("Line 1");
    expect(result.stderr).toContain("../../billing/models/invoice");
    expect(result.stderr).toContain("reservations -> billing");
    expect(result.stderr).toContain("Fix:");
    expect(result.stderr).toContain("context map");
  });

  // --- File not in any context ---

  it("allows import when file is not in any defined context (exit 0)", () => {
    writeOwnershipMap(tempDir, {
      "src/domain/reservation/**": "reservations",
      "src/domain/billing/**": "billing",
    });

    const inputPath = writeToolInputFile(
      tempDir,
      "src/utilities/helper.ts",
      'import { Invoice } from "../domain/billing/models/invoice";\n',
    );

    const result = runHook(tempDir, inputPath);
    expect(result.exitCode).toBe(0);
  });

  // --- Missing tool input args ---

  it("exits 0 when tool type or input file is missing", () => {
    const result = runHook(tempDir, "");
    expect(result.exitCode).toBe(0);
  });
});
