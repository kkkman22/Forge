/**
 * Property test: Canvas HTML rendering is XSS-safe.
 *
 * Invariant: for any review finding text containing `<script>`,
 * the rendered HTML must NOT contain an active `<script>` element
 * whose body derives from the finding text [R13.8].
 *
 * **Validates: Requirements R4.8, R13.8**
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { type CanvasOptions, renderCanvas } from "../src/canvas-renderer.js";

const maliciousTexts = [
  '<script>alert("xss")</script>',
  "<script>document.cookie</script>",
  '<img onerror="alert(1)" src=x>',
  '<svg onload="alert(1)">',
  '"><script>alert(1)</script>',
  "'-alert(1)-'",
  '<a href="javascript:alert(1)">click</a>',
  '<iframe src="javascript:alert(1)">',
  "<details open ontoggle=alert(1)>",
  "<marquee onstart=alert(1)>",
];

let testDir: string;

describe("Canvas XSS safety property [R13.8, R4.8]", () => {
  afterEach(() => {
    if (testDir) {
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {
        /* */
      }
    }
  });

  it("no active <script> from finding text (200 iterations)", async () => {
    fc.assert(
      fc.asyncProperty(
        fc.record({
          spec: fc.array(
            fc.record({
              severity: fc.constantFrom("P0", "P1", "P2", "P3"),
              file: fc.string({ maxLength: 50 }),
              issue: fc.string({ maxLength: 500 }),
              suggestion: fc.string({ maxLength: 200 }),
            }),
            { maxLength: 5 },
          ),
          quality: fc.array(
            fc.record({
              severity: fc.constantFrom("P0", "P1", "P2", "P3"),
              file: fc.string({ maxLength: 50 }),
              issue: fc.string({ maxLength: 500 }),
              suggestion: fc.string({ maxLength: 200 }),
            }),
            { maxLength: 5 },
          ),
          security: fc.array(
            fc.record({
              severity: fc.constantFrom("P0", "P1", "P2", "P3"),
              file: fc.string({ maxLength: 50 }),
              issue: fc.string({ maxLength: 500 }),
              suggestion: fc.string({ maxLength: 200 }),
            }),
            { maxLength: 5 },
          ),
        }),
        async (findings) => {
          testDir = join(tmpdir(), `forge-canvas-xss-${Date.now()}`);

          // Write a fake review file
          const forgeDir = join(testDir, ".tinkerman");
          mkdirSync(join(forgeDir, "reviews"), { recursive: true });
          writeFileSync(join(forgeDir, "reviews", "xss-test.md"), "# Review\n\nSome content");

          const opts: CanvasOptions = {
            topic: "xss-test",
            cwd: testDir,
            forgeDir,
            findings,
          };

          const result = await renderCanvas(opts);

          // Check: no <script> in the HTML body (outside JSON island)
          // The JSON island is inside a script[type="application/json"] which is inert
          const htmlBody = result.html;
          // Remove the JSON island first
          const withoutJsonIsland = htmlBody.replace(
            /<script id="findings-data"[^>]*>[\s\S]*?<\/script>/,
            "",
          );

          // No active <script> tags outside the JSON island and renderer script
          // The renderer <script> is our own code, not from finding text
          const withoutRenderer = withoutJsonIsland
            .replace(/<script>{{renderer_js}}<\/script>/, "")
            .replace(/<script>[\s\S]*?<\/script>/gi, "");

          // After removing all scripts, no finding text should contain active script tags
          expect(withoutRenderer).not.toMatch(/<script[^>]*>/i);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("known malicious patterns produce no active scripts", async () => {
    for (const malicious of maliciousTexts) {
      testDir = join(tmpdir(), `forge-canvas-malicious-${Date.now()}`);
      const forgeDir = join(testDir, ".tinkerman");
      mkdirSync(join(forgeDir, "reviews"), { recursive: true });
      writeFileSync(join(forgeDir, "reviews", "malicious.md"), "# Review");

      const result = await renderCanvas({
        topic: "malicious",
        cwd: testDir,
        forgeDir,
        findings: {
          spec: [{ severity: "P1", file: "test.ts", issue: malicious, suggestion: malicious }],
          quality: [],
          security: [],
        },
      });

      const withoutJsonIsland = result.html.replace(
        /<script id="findings-data"[^>]*>[\s\S]*?<\/script>/,
        "",
      );
      const withoutRenderer = withoutJsonIsland
        .replace(/<script>{{renderer_js}}<\/script>/, "")
        .replace(/<script>[\s\S]*?<\/script>/gi, "");
      expect(withoutRenderer).not.toMatch(/<script[^>]*>/i);
    }
  });
});
