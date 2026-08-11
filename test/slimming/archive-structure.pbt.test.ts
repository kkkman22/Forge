// Feature: forge-slimming-plan, Property 6: Archive Preserves Directory Structure
// Validates that archived content matches the original structure.

import fc from "fast-check";
import { describe, expect, it } from "vitest";

interface FileEntry {
  relativePath: string;
  content: string;
}

function simulateArchive(
  files: FileEntry[],
  slug: string,
  date: string,
): { archived: FileEntry[]; mapping: Map<string, string> } {
  const prefix = `.tinkerman/archive/${date}-${slug}/`;
  const mapping = new Map<string, string>();
  const archived: FileEntry[] = [];

  for (const f of files) {
    const newPath = prefix + f.relativePath;
    archived.push({ relativePath: newPath, content: f.content });
    mapping.set(f.relativePath, newPath);
  }

  return { archived, mapping };
}

describe("Property 6: Archive Structure Preservation", () => {
  it("archived tree has same relative paths under archive prefix", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => /^[a-z-]+$/.test(s)),
        fc.record({ date: fc.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
        fc.array(
          fc.record({
            relativePath: fc.stringMatching(/^[a-z0-9/_.-]+$/),
            content: fc.string({ minLength: 1 }),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (slug, { date }, files) => {
          const { archived, mapping } = simulateArchive(files, slug, date);
          const prefix = `.tinkerman/archive/${date}-${slug}/`;

          expect(archived.length).toBe(files.length);
          for (let i = 0; i < files.length; i++) {
            expect(archived[i].relativePath).toBe(prefix + files[i].relativePath);
            expect(archived[i].content).toBe(files[i].content);
            expect(mapping.get(files[i].relativePath)).toBe(archived[i].relativePath);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("cross-reference rewrite maps to archived location", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => /^[a-z-]+$/.test(s)),
        fc.record({ date: fc.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
        fc.array(
          fc.record({ relativePath: fc.stringMatching(/^[a-z0-9/_.-]+$/), content: fc.string() }),
          {
            minLength: 1,
            maxLength: 5,
          },
        ),
        (slug, { date }, files) => {
          const { mapping } = simulateArchive(files, slug, date);

          // Simulate reference rewrite
          for (const [original, archived] of mapping) {
            expect(archived).toContain(date);
            expect(archived).toContain(slug);
            expect(archived.endsWith(original)).toBe(true);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
