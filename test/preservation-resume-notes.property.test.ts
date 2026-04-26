/**
 * Preservation Property Tests: resumeRun and Notes Round-Trip
 *
 * These tests capture the BASELINE behavior of the unfixed code to ensure
 * no regressions are introduced by the bugfix. They must PASS on both
 * unfixed and fixed code.
 *
 * **Property 2: Preservation** — Single-Run Resume, No-Run Resume,
 * Notes Round-Trip, and setupNewRun behavior.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3**
 */
import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

// Mock node:child_process before importing the module under test
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

// Mock node:crypto before importing the module under test
vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(),
}));

// Mock node:fs before importing the module under test
vi.mock("node:fs", () => ({
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
}));

// Import after mocking
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { formatNotesDocument, parseNotesDocument } from "../src/context-accumulator.js";
import type { IterationEntry, NotesDocument } from "../src/loop-types.js";
import { RunManager } from "../src/run-manager.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FAKE_SHA = "abc123def456789012345678901234567890abcd";
const FAKE_NEW_UUID = "new-uuid-0000-0000-0000-000000000000";
const CWD = "/test/repo";

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  (randomUUID as Mock).mockReturnValue(FAKE_NEW_UUID);
  (execFileSync as Mock).mockReturnValue(Buffer.from(`${FAKE_SHA}\n`));
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Single-line string without markdown formatting characters that could
 * confuse the parser. Avoids `###`, `**`, leading `- `, and newlines.
 */
const cleanLineArb = fc
  .string({ minLength: 1, maxLength: 80 })
  .filter((s) => !s.includes("\n") && !s.includes("\r"))
  .map((s) => s.replace(/^- /, "x ").replace(/#{3}/g, "H").replace(/\*\*/g, "xx"))
  .filter((s) => s.length > 0 && s.trim().length > 0 && s === s.trim());

/** Positive iteration number. */
const iterationNumberArb = fc.integer({ min: 1, max: 500 });

/** RunId without newlines, markdown formatting, or whitespace-only values. */
const runIdArb = cleanLineArb.filter((s) => s.trim().length > 0);

/**
 * Round-trip-safe IterationEntry: failed entries have empty keyChanges
 * because formatIterationEntry omits key changes for failed iterations.
 */
const roundTripEntryArb: fc.Arbitrary<IterationEntry> = fc
  .tuple(
    iterationNumberArb,
    fc.boolean(),
    cleanLineArb,
    fc.array(cleanLineArb, { minLength: 0, maxLength: 5 }),
    fc.array(cleanLineArb, { minLength: 0, maxLength: 5 }),
  )
  .map(([number, success, summary, keyChanges, keyLearnings]) => ({
    number,
    success,
    summary,
    keyChanges: success ? keyChanges : [],
    keyLearnings,
  }));

/**
 * Arbitrary NotesDocument WITHOUT branchName field — captures the
 * current (unfixed) shape of the type.
 */
const notesDocumentArb: fc.Arbitrary<NotesDocument> = fc
  .tuple(runIdArb, fc.array(roundTripEntryArb, { minLength: 0, maxLength: 8 }))
  .map(([runId, entries]) => ({ runId, entries }));

/** UUID-like run IDs for realistic directory names. */
const uuidRunIdArb = fc.uuid();

/** Branch name generator — forge/<slug> format. */
const branchNameArb = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter((s) => /^[a-zA-Z0-9]/.test(s) && !s.includes("\n"))
  .map((s) => `forge/${s.replace(/[^a-zA-Z0-9-]/g, "-")}`);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a notes.md content string for a given runId and branchName.
 * This matches the format produced by formatNotesDocument on fixed code.
 */
function buildNotesContent(runId: string, branchName?: string): string {
  return branchName !== undefined
    ? formatNotesDocument({ runId, branchName, entries: [] })
    : formatNotesDocument({ runId, entries: [] });
}

/**
 * Build notes content with iteration entries for richer testing.
 */
function buildNotesContentWithEntries(
  runId: string,
  entries: IterationEntry[],
  branchName?: string,
): string {
  return branchName !== undefined
    ? formatNotesDocument({ runId, branchName, entries })
    : formatNotesDocument({ runId, entries });
}

// ---------------------------------------------------------------------------
// Preservation: Notes Round-Trip (without branchName)
// ---------------------------------------------------------------------------

describe("Preservation: Notes round-trip without branchName", () => {
  /**
   * For all NotesDocument values (without branchName field),
   * parseNotesDocument(formatNotesDocument(doc)) produces semantically
   * equivalent output.
   *
   * This captures the existing round-trip guarantee that must be preserved
   * after the fix adds branchName support.
   *
   * **Validates: Requirements 3.1, 3.2, 3.3**
   */
  it("parseNotesDocument(formatNotesDocument(doc)) round-trips without branchName", () => {
    fc.assert(
      fc.property(notesDocumentArb, (doc) => {
        const markdown = formatNotesDocument(doc);
        const parsed = parseNotesDocument(markdown);

        // runId preserved
        expect(parsed.runId).toBe(doc.runId);

        // Entry count preserved
        expect(parsed.entries.length).toBe(doc.entries.length);

        // Each entry semantically equivalent
        for (let i = 0; i < doc.entries.length; i++) {
          const original = doc.entries[i];
          const roundTripped = parsed.entries[i];

          expect(roundTripped.number).toBe(original.number);
          expect(roundTripped.success).toBe(original.success);
          expect(roundTripped.summary).toBe(original.summary);
          expect(roundTripped.keyChanges).toEqual(original.keyChanges);
          expect(roundTripped.keyLearnings).toEqual(original.keyLearnings);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Empty documents round-trip correctly.
   *
   * **Validates: Requirements 3.1, 3.2, 3.3**
   */
  it("empty NotesDocument round-trips correctly", () => {
    fc.assert(
      fc.property(runIdArb, (runId) => {
        const doc: NotesDocument = { runId, entries: [] };
        const markdown = formatNotesDocument(doc);
        const parsed = parseNotesDocument(markdown);

        expect(parsed.runId).toBe(runId);
        expect(parsed.entries).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Preservation: Single-run resume
// ---------------------------------------------------------------------------

describe("Preservation: Single-run resume returns valid RunSetup", () => {
  /**
   * With exactly one run directory, resumeRun returns a valid RunSetup
   * with correct runId, runDir, baseCommit, notesPath, branchName,
   * and lastIteration.
   *
   * **Validates: Requirements 3.1**
   */
  it("single run directory returns valid RunSetup with correct fields", () => {
    fc.assert(
      fc.property(uuidRunIdArb, branchNameArb, (existingRunId, branchName) => {
        vi.clearAllMocks();
        (execFileSync as Mock).mockReturnValue(Buffer.from(`${FAKE_SHA}\n`));
        (randomUUID as Mock).mockReturnValue(FAKE_NEW_UUID);

        const notesContent = buildNotesContent(existingRunId, branchName);

        // Set up exactly one run directory
        (existsSync as Mock).mockImplementation((p: string) => {
          if (p === `${CWD}/.forge/runs/`) return true;
          if (p === `${CWD}/.forge/runs/${existingRunId}/notes.md`) return true;
          return false;
        });

        (readdirSync as Mock).mockReturnValue([{ name: existingRunId, isDirectory: () => true }]);

        (readFileSync as Mock).mockReturnValue(notesContent);

        const result = RunManager.resumeRun(branchName, CWD);

        // RunSetup fields are valid
        expect(result.runId).toBe(existingRunId);
        expect(result.runDir).toBe(`${CWD}/.forge/runs/${existingRunId}/`);
        expect(result.notesPath).toBe(`${CWD}/.forge/runs/${existingRunId}/notes.md`);
        expect(result.baseCommit).toBe(FAKE_SHA);
        expect(result.branchName).toBe(branchName);
        expect(result.lastIteration).toBe(0);
      }),
      { numRuns: 50 },
    );
  });

  /**
   * Single run with iteration entries returns correct lastIteration.
   *
   * **Validates: Requirements 3.1**
   */
  it("single run with entries returns correct lastIteration", () => {
    fc.assert(
      fc.property(
        uuidRunIdArb,
        branchNameArb,
        fc.array(roundTripEntryArb, { minLength: 1, maxLength: 5 }),
        (existingRunId, branchName, entries) => {
          vi.clearAllMocks();
          (execFileSync as Mock).mockReturnValue(Buffer.from(`${FAKE_SHA}\n`));
          (randomUUID as Mock).mockReturnValue(FAKE_NEW_UUID);

          const notesContent = buildNotesContentWithEntries(existingRunId, entries, branchName);

          (existsSync as Mock).mockImplementation((p: string) => {
            if (p === `${CWD}/.forge/runs/`) return true;
            if (p === `${CWD}/.forge/runs/${existingRunId}/notes.md`) return true;
            return false;
          });

          (readdirSync as Mock).mockReturnValue([{ name: existingRunId, isDirectory: () => true }]);

          (readFileSync as Mock).mockReturnValue(notesContent);

          const result = RunManager.resumeRun(branchName, CWD);

          const expectedLastIteration = Math.max(...entries.map((e) => e.number));
          expect(result.lastIteration).toBe(expectedLastIteration);
          expect(result.runId).toBe(existingRunId);
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Preservation: No-run resume
// ---------------------------------------------------------------------------

describe("Preservation: No-run resume creates new run directory", () => {
  /**
   * With no run directories, resumeRun creates a new run directory
   * with a fresh runId and initialized notes.md.
   *
   * **Validates: Requirements 3.2**
   */
  it("creates new run when no run directories exist", () => {
    fc.assert(
      fc.property(branchNameArb, (branchName) => {
        vi.clearAllMocks();
        (execFileSync as Mock).mockReturnValue(Buffer.from(`${FAKE_SHA}\n`));
        (randomUUID as Mock).mockReturnValue(FAKE_NEW_UUID);

        // No runs directory exists
        (existsSync as Mock).mockReturnValue(false);

        const result = RunManager.resumeRun(branchName, CWD);

        // A new run is created with the mocked UUID
        expect(result.runId).toBe(FAKE_NEW_UUID);
        expect(result.runDir).toBe(`${CWD}/.forge/runs/${FAKE_NEW_UUID}/`);
        expect(result.notesPath).toBe(`${CWD}/.forge/runs/${FAKE_NEW_UUID}/notes.md`);
        expect(result.baseCommit).toBe(FAKE_SHA);
        expect(result.branchName).toBe(branchName);
        expect(result.lastIteration).toBe(0);

        // Directory and notes file were created
        expect(mkdirSync).toHaveBeenCalledWith(`${CWD}/.forge/runs/${FAKE_NEW_UUID}/`, {
          recursive: true,
        });
        expect(writeFileSync).toHaveBeenCalled();
      }),
      { numRuns: 50 },
    );
  });

  /**
   * With runs directory existing but empty (no subdirectories),
   * resumeRun creates a new run.
   *
   * **Validates: Requirements 3.2**
   */
  it("creates new run when runs directory is empty", () => {
    fc.assert(
      fc.property(branchNameArb, (branchName) => {
        vi.clearAllMocks();
        (execFileSync as Mock).mockReturnValue(Buffer.from(`${FAKE_SHA}\n`));
        (randomUUID as Mock).mockReturnValue(FAKE_NEW_UUID);

        // Runs directory exists but is empty
        (existsSync as Mock).mockImplementation((p: string) => {
          if (p === `${CWD}/.forge/runs/`) return true;
          return false;
        });
        (readdirSync as Mock).mockReturnValue([]);

        const result = RunManager.resumeRun(branchName, CWD);

        expect(result.runId).toBe(FAKE_NEW_UUID);
        expect(result.runDir).toBe(`${CWD}/.forge/runs/${FAKE_NEW_UUID}/`);
        expect(result.notesPath).toBe(`${CWD}/.forge/runs/${FAKE_NEW_UUID}/notes.md`);
        expect(result.branchName).toBe(branchName);
        expect(result.lastIteration).toBe(0);

        expect(mkdirSync).toHaveBeenCalled();
        expect(writeFileSync).toHaveBeenCalled();
      }),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Preservation: setupNewRun produces valid RunSetup
// ---------------------------------------------------------------------------

describe("Preservation: setupNewRun produces valid RunSetup", () => {
  /**
   * setupNewRun continues to produce valid RunSetup with all required
   * fields: runId, runDir, baseCommit, notesPath, branchName.
   *
   * **Validates: Requirements 3.3**
   */
  it("setupNewRun returns RunSetup with all required fields", () => {
    fc.assert(
      fc.property(cleanLineArb, (objective) => {
        vi.clearAllMocks();
        (randomUUID as Mock).mockReturnValue(FAKE_NEW_UUID);
        (execFileSync as Mock).mockReturnValue(Buffer.from(`${FAKE_SHA}\n`));

        const result = RunManager.setupNewRun(objective, CWD);

        // All required fields present and valid
        expect(result.runId).toBe(FAKE_NEW_UUID);
        expect(result.runDir).toContain(FAKE_NEW_UUID);
        expect(result.runDir).toMatch(/\/$/); // ends with /
        expect(result.baseCommit).toBe(FAKE_SHA);
        expect(result.notesPath).toContain("notes.md");
        expect(result.notesPath).toContain(FAKE_NEW_UUID);
        expect(result.branchName).toMatch(/^forge\//);

        // Directory was created
        expect(mkdirSync).toHaveBeenCalledWith(result.runDir, { recursive: true });

        // Notes file was written
        expect(writeFileSync).toHaveBeenCalledWith(result.notesPath, expect.any(String), "utf-8");

        // Git branch was created
        expect(execFileSync).toHaveBeenCalledWith("git", ["checkout", "-b", result.branchName], {
          cwd: CWD,
        });
      }),
      { numRuns: 50 },
    );
  });

  /**
   * setupNewRun writes a valid notes document that can be parsed back.
   *
   * **Validates: Requirements 3.3**
   */
  it("setupNewRun writes parseable notes document with correct runId", () => {
    fc.assert(
      fc.property(cleanLineArb, (objective) => {
        vi.clearAllMocks();
        (randomUUID as Mock).mockReturnValue(FAKE_NEW_UUID);
        (execFileSync as Mock).mockReturnValue(Buffer.from(`${FAKE_SHA}\n`));

        RunManager.setupNewRun(objective, CWD);

        // Capture what was written to the notes file
        const writeCall = (writeFileSync as Mock).mock.calls.find(
          (call: unknown[]) =>
            typeof call[0] === "string" && (call[0] as string).includes("notes.md"),
        );
        expect(writeCall).toBeDefined();

        const writtenContent = writeCall?.[1] as string;
        const parsed = parseNotesDocument(writtenContent);

        expect(parsed.runId).toBe(FAKE_NEW_UUID);
        expect(parsed.entries).toEqual([]);
      }),
      { numRuns: 50 },
    );
  });
});
