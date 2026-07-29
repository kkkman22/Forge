/**
 * Explore_Summarizer — serialize/deserialize explore-agent results.
 *
 * Extracted from `context-budget.ts` (audit P2 #9 god-file split).
 */

/** @public */
export interface ExploreSummary {
  entryPoints: Array<{ filePath: string; line: number; functionName: string }>;
  dependencyChain: string[];
  relatedTests: Array<{ filePath: string; testCount: number }>;
  keyInterfaces: Array<{ name: string; filePath: string; line: number }>;
  fileGroups: Array<{ moduleName: string; fileCount: number }>;
}

/** @public */
export function serializeExploreResult(input: ExploreSummary | string | null | undefined): string {
  if (input === null || input === undefined) {
    return "Explore Agent 返回空结果";
  }
  if (typeof input === "string") {
    return input;
  }
  if (
    input.entryPoints.length === 0 &&
    input.dependencyChain.length === 0 &&
    input.relatedTests.length === 0 &&
    input.keyInterfaces.length === 0 &&
    input.fileGroups.length === 0
  ) {
    return "Explore Agent 返回空结果";
  }
  return serializeExploreSummary(input);
}

/** @public */
export function serializeExploreSummary(summary: ExploreSummary): string {
  const lines: string[] = [
    "\u{1F4CD} \u{4EE3}\u{7801}\u{5E93}\u{63A2}\u{7D22}\u{7ED3}\u{679C}\u{FF08}\u{6458}\u{8981}\u{FF09}",
  ];

  for (const ep of summary.entryPoints) {
    lines.push(`  \u{5165}\u{53E3}\u{70B9}\u{FF1A}${ep.filePath}:${ep.line} (${ep.functionName})`);
  }

  if (summary.dependencyChain.length > 0) {
    lines.push(`  \u{4F9D}\u{8D56}\u{94FE}\u{FF1A}${summary.dependencyChain.join(" \u2192 ")}`);
  }

  for (const t of summary.relatedTests) {
    lines.push(
      `  \u{76F8}\u{5173}\u{6D4B}\u{8BD5}\u{FF1A}${t.filePath}\u{FF08}${t.testCount} \u{4E2A}\u{7528}\u{4F8B}\u{FF09}`,
    );
  }

  for (const iface of summary.keyInterfaces) {
    lines.push(
      `  \u{5173}\u{952E}\u{63A5}\u{53E3}\u{FF1A}${iface.name} (${iface.filePath}:${iface.line})`,
    );
  }

  if (summary.fileGroups.length > 0) {
    const groups = summary.fileGroups.map(
      (g) => `${g.moduleName}\u{FF08}${g.fileCount} \u{4E2A}\u{6587}\u{4EF6}\u{FF09}`,
    );
    lines.push(`  \u{6587}\u{4EF6}\u{5206}\u{7EC4}\u{FF1A}${groups.join(", ")}`);
  }

  return lines.join("\n");
}

/** @public */
export function deserializeExploreSummary(text: string): ExploreSummary {
  const result: ExploreSummary = {
    entryPoints: [],
    dependencyChain: [],
    relatedTests: [],
    keyInterfaces: [],
    fileGroups: [],
  };

  const lines = text.split("\n");
  for (const line of lines) {
    let m: RegExpMatchArray | null;

    m = line.match(/^\s*入口点：(.+):(\d+) \((\w+)\)$/u);
    if (m) {
      result.entryPoints.push({
        filePath: m[1],
        line: Number.parseInt(m[2], 10),
        functionName: m[3],
      });
      continue;
    }

    m = line.match(/^\s*依赖链：(.+)$/u);
    if (m) {
      result.dependencyChain = m[1].split(" → ");
      continue;
    }

    m = line.match(/^\s*相关测试：(.+)（(\d+) 个用例）$/u);
    if (m) {
      result.relatedTests.push({
        filePath: m[1],
        testCount: Number.parseInt(m[2], 10),
      });
      continue;
    }

    m = line.match(/^\s*关键接口：(\w+) \((.+):(\d+)\)$/u);
    if (m) {
      result.keyInterfaces.push({
        name: m[1],
        filePath: m[2],
        line: Number.parseInt(m[3], 10),
      });
      continue;
    }

    m = line.match(/^\s*文件分组：(.+)$/u);
    if (m) {
      const parts = m[1].split(", ");
      for (const part of parts) {
        const gMatch = part.match(/^(.+)（(\d+) 个文件）$/u);
        if (gMatch) {
          result.fileGroups.push({
            moduleName: gMatch[1],
            fileCount: Number.parseInt(gMatch[2], 10),
          });
        }
      }
    }
  }

  return result;
}
