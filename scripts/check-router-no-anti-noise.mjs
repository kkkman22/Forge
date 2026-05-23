#!/usr/bin/env node
// category: internal-only
/**
 * check-router-no-anti-noise.mjs — R3-3 CI guard.
 *
 * Scans src/router.ts and src/router-intents.ts for "content stripping"
 * patterns that would violate the "no anti-noise" rule. Detects:
 *   - String.prototype.replace with wildcard/tag/URL regex patterns
 *   - split + slice chain patterns for content truncation
 *   - Any function whose name suggests content stripping
 *
 * Uses TS AST via the `typescript` package (not regex-on-source).
 *
 * Exit codes:
 *   0: no stripping patterns found
 *   1: stripping patterns detected
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const FILES = [
  resolve(ROOT, "src/router.ts"),
  resolve(ROOT, "src/router-intents.ts"),
];

// Patterns that indicate content stripping in replace() calls
const STRIP_REGEX_PATTERNS = [
  /<.*>/,          // HTML/XML tag stripping
  /```.*```/,      // Code block stripping
  /https?:/,       // URL stripping
  /\[.*\]\(.*\)/,  // Markdown link stripping
  /\*\*.*\*\*/,    // Bold stripping
];

const violations = [];

function checkNode(node, sourceFile, filePath) {
  // Check replace() calls with regex that strips content
  if (ts.isCallExpression(node)) {
    const expr = node.expression;
    if (ts.isPropertyAccessExpression(expr)) {
      if (expr.name.text === "replace") {
        const arg = node.arguments[0];
        if (arg && ts.isRegularExpressionLiteral(arg)) {
          const pattern = arg.text;
          for (const stripPattern of STRIP_REGEX_PATTERNS) {
            if (stripPattern.test(pattern)) {
              const { line } = sourceFile.getLineAndCharacterOfPosition(arg.getStart());
              violations.push({
                file: filePath,
                line: line + 1,
                kind: "strip-replace",
                detail: `replace with stripping regex: ${pattern}`,
              });
            }
          }
        }
      }

      // Check split().slice() chains
      if (expr.name.text === "slice") {
        let current = expr.expression;
        if (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
          if (current.expression.name.text === "split") {
            const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            violations.push({
              file: filePath,
              line: line + 1,
              kind: "split-slice",
              detail: "split().slice() chain detected (content truncation pattern)",
            });
          }
        }
      }
    }
  }

  // Check function declarations whose name suggests stripping
  if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)) {
    let name = "";
    if (node.name) {
      name = node.name.text;
    } else if (ts.isVariableDeclaration(node.parent)) {
      name = node.parent.name.getText(sourceFile);
    }
    const stripNames = ["sanitize", "strip", "remove", "clean", "filter", "scrub"];
    if (stripNames.some((s) => name.toLowerCase().includes(s)) &&
        name.toLowerCase().includes("content") || name.toLowerCase().includes("noise") ||
        name.toLowerCase().includes("markdown") || name.toLowerCase().includes("code") ||
        name.toLowerCase().includes("xml") || name.toLowerCase().includes("url")) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      violations.push({
        file: filePath,
        line: line + 1,
        kind: "strip-function",
        detail: `function name suggests stripping: ${name}`,
      });
    }
  }

  ts.forEachChild(node, (child) => checkNode(child, sourceFile, filePath));
}

function main() {
  for (const filePath of FILES) {
    try {
      const source = readFileSync(filePath, "utf-8");
      const sourceFile = ts.createSourceFile(
        filePath,
        source,
        ts.ScriptTarget.Latest,
        true,
      );
      checkNode(sourceFile, sourceFile, filePath);
    } catch {
      // File may not exist yet — skip
    }
  }

  if (violations.length > 0) {
    console.error("❌ Anti-noise stripping patterns detected:");
    for (const v of violations) {
      console.error(`   ${v.file}:${v.line} [${v.kind}] ${v.detail}`);
    }
    console.error("   Remove these patterns. Router must not strip content from input.");
    process.exit(1);
  }

  console.log("✅ No anti-noise stripping patterns found in router files");
}

main();
