import { classify } from "./conflict-classifier.js";

export type Zone = "frozen" | "guarded" | "open" | "source";

export function classifyConflictZone(path: string, _statusContent: string): Zone {
  return classify(path);
}

export function parseConflictedPaths(gitOutput: string): string[] {
  const matches = gitOutput.matchAll(/Merge conflict in (.+)$/gm);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const m of matches) {
    const path = m[1];
    if (path && !seen.has(path)) {
      seen.add(path);
      result.push(path);
    }
  }
  return result;
}
