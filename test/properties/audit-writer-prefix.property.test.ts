import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { type AuditSubcommand, WorkflowAuditWriter } from "../../src/workflow-audit-writer.js";

const numRuns = process.env.CI ? 100 : 1000;

const subcommandArb: fc.Arbitrary<AuditSubcommand> = fc.constantFrom("review", "decide", "learn");

describe("R4.5 audit-writer prefix property", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs) {
      rmSync(d, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  function makeTmp(): string {
    const d = mkdtempSync(join(tmpdir(), "audit-pbt-"));
    tmpDirs.push(d);
    return d;
  }

  it("after any sequence of writes to the same file, new content always starts with old content", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          topic: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-z0-9_-]+$/.test(s)),
          runId: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
        }),
        subcommandArb,
        fc.array(fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.jsonValue()), {
          minLength: 2,
          maxLength: 10,
        }),
        async (identifiers, subcommand, payloads) => {
          const forgeRoot = makeTmp();
          const writer = new WorkflowAuditWriter(forgeRoot, () => false);
          const destPath = resolveExpectedPath(
            forgeRoot,
            subcommand,
            identifiers.topic,
            identifiers.runId,
          );

          for (const payload of payloads) {
            const before = fileReadOrNull(destPath);
            await writer.write({
              subcommand,
              runId: identifiers.runId,
              topic: identifiers.topic,
              payload,
            });
            const after = readFileSync(destPath, "utf-8");
            if (before !== null) {
              expect(after.startsWith(before)).toBe(true);
            }
          }
        },
      ),
      { numRuns },
    );
  });

  it("single write produces non-empty content with runId", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-z0-9_-]+$/.test(s)),
        fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.jsonValue()),
        subcommandArb,
        async (runId, topic, payload, subcommand) => {
          const forgeRoot = makeTmp();
          const writer = new WorkflowAuditWriter(forgeRoot, () => false);
          await writer.write({ subcommand, runId, topic, payload });

          const destPath = resolveExpectedPath(forgeRoot, subcommand, topic, runId);
          const content = readFileSync(destPath, "utf-8");
          expect(content.length).toBeGreaterThan(0);
          expect(content).toContain(runId);
        },
      ),
      { numRuns },
    );
  });

  it("frozen zone path always rejects the write", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-z0-9_-]+$/.test(s)),
        fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.jsonValue()),
        subcommandArb,
        async (runId, topic, payload, subcommand) => {
          const forgeRoot = makeTmp();
          const writer = new WorkflowAuditWriter(forgeRoot, () => true);

          await expect(writer.write({ subcommand, runId, topic, payload })).rejects.toThrow();
        },
      ),
      { numRuns },
    );
  });
});

function fileReadOrNull(path: string): string | null {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

function resolveExpectedPath(
  forgeRoot: string,
  subcommand: AuditSubcommand,
  topic: string,
  runId: string,
): string {
  switch (subcommand) {
    case "review":
      return join(forgeRoot, "reviews", `${topic}.md`);
    case "decide": {
      const slug = topic
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const date = new Date().toISOString().slice(0, 10);
      return join(forgeRoot, "decisions", `${date}-${slug}.md`);
    }
    case "learn":
      return join(forgeRoot, "knowledge", "sessions", `${runId}.md`);
  }
}
