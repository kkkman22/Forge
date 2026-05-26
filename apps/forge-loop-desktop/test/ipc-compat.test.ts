import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = join(import.meta.dirname, "../../..");
const FIXTURE = join(
  ROOT,
  "apps/forge-loop-desktop/test/fixtures/ipc-baseline.ndjson",
);
const RECORD_SCRIPT = join(ROOT, "scripts/record-ipc-baseline.mjs");
const DIFF_SCRIPT = join(ROOT, "scripts/diff-ipc-schema.mjs");

const { diffIpcSchema } = await import(DIFF_SCRIPT);

describe("ipc-compat", () => {
  const tmp = mkdtempSync(join(tmpdir(), "ipc-compat-"));

  beforeAll(() => {
    execFileSync("node", [RECORD_SCRIPT], { cwd: ROOT, encoding: "utf-8" });
  });

  it("baseline fixture diff passes after recording", async () => {
    const result = await diffIpcSchema(FIXTURE, FIXTURE);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("detects missing event type", async () => {
    const lines = readFileSync(FIXTURE, "utf-8")
      .trim()
      .split("\n")
      .filter(Boolean);
    const filtered = lines.filter(
      (line) => JSON.parse(line).event !== "completion",
    );
    const modifiedPath = join(tmp, "missing-event.ndjson");
    writeFileSync(modifiedPath, filtered.join("\n") + "\n");

    const result = await diffIpcSchema(FIXTURE, modifiedPath);
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.stringContaining("missing event type: completion")]),
    );
  });

  it("detects type mismatch on field", async () => {
    const lines = readFileSync(FIXTURE, "utf-8")
      .trim()
      .split("\n")
      .filter(Boolean);
    const modified = lines.map((line) => {
      const obj = JSON.parse(line);
      if (obj.event === "progress" && "percentage" in obj) {
        return JSON.stringify({ ...obj, percentage: "not-a-number" });
      }
      return line;
    });
    const modifiedPath = join(tmp, "type-mismatch.ndjson");
    writeFileSync(modifiedPath, modified.join("\n") + "\n");

    const result = await diffIpcSchema(FIXTURE, modifiedPath);
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("type mismatch"),
        expect.stringContaining("percentage"),
        expect.stringContaining("progress"),
      ]),
    );
  });
});
