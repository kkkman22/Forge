import type { DiagnosticRecord, Doc, DocPair, DocPath, PairState, Severity } from "./types.js";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const EN_SUFFIX = ".en.md";
const CN_SUFFIX = ".md";
const DRIFT_THRESHOLD_DAYS = 14;

// ─────────────────────────────────────────────────────────────
// pairBilingual
// ─────────────────────────────────────────────────────────────

/**
 * Pairs .md/.en.md documents by slug in the same directory.
 */
export function pairBilingual(docs: readonly Doc[]): DocPair[] {
  // Group docs by (directory, slug)
  const groups = new Map<string, { cn?: Doc; en?: Doc }>();

  for (const doc of docs) {
    const { directory, slug, isEn } = splitPath(doc.path);

    const key = `${directory}::${slug}`;

    if (!groups.has(key)) {
      groups.set(key, {});
    }
    const group = groups.get(key) as { cn?: Doc; en?: Doc };

    if (isEn) {
      group.en = doc;
    } else {
      group.cn = doc;
    }
  }

  const pairs: DocPair[] = [];

  for (const [key, group] of groups) {
    const separatorIdx = key.indexOf("::");
    const directory = key.slice(0, separatorIdx) as DocPath;
    const slug = key.slice(separatorIdx + 2);

    const state = determinePairState(group);

    pairs.push({
      slug,
      directory,
      cn: group.cn,
      en: group.en,
      state,
    });
  }

  return pairs;
}

// ─────────────────────────────────────────────────────────────
// checkBilingualPairs
// ─────────────────────────────────────────────────────────────

/**
 * Validates paired bilingual documents and returns diagnostics.
 */
export function checkBilingualPairs(pairs: readonly DocPair[]): DiagnosticRecord[] {
  const diagnostics: DiagnosticRecord[] = [];

  for (const pair of pairs) {
    switch (pair.state) {
      case "cn-only":
        // No diagnostics needed for CN-only docs
        break;

      case "orphan_mirror":
        diagnostics.push(
          makeDiagnostic(
            pair.en?.path,
            "warning",
            `orphan_mirror: EN file "${pair.en?.path}" has mirror_of but CN counterpart is missing`,
            { code: "orphan_mirror" },
          ),
        );
        break;

      case "en-only": {
        diagnostics.push(
          makeDiagnostic(
            pair.en?.path,
            "notice",
            `EN file "${pair.en?.path}" exists without CN counterpart`,
          ),
        );
        break;
      }

      case "paired": {
        const en = pair.en as Doc;
        const cn = pair.cn as Doc;

        // Check mirror_of field validation
        diagnostics.push(...validateMirrorOf(en, pair));

        // Check category consistency (R12.8)
        if (en.frontmatter.category !== cn.frontmatter.category) {
          diagnostics.push(
            makeDiagnostic(
              en.path,
              "error",
              `R12.8 category mismatch: EN="${en.frontmatter.category}", CN="${cn.frontmatter.category}"`,
              { code: "category_mismatch" },
            ),
          );
        }

        // Check audience consistency (R12.8)
        const enAud = [...en.frontmatter.audience].sort();
        const cnAud = [...cn.frontmatter.audience].sort();
        if (JSON.stringify(enAud) !== JSON.stringify(cnAud)) {
          diagnostics.push(
            makeDiagnostic(
              en.path,
              "error",
              `R12.8 audience mismatch: EN=[${en.frontmatter.audience.join(",")}], CN=[${cn.frontmatter.audience.join(",")}]`,
              { code: "audience_mismatch" },
            ),
          );
        }

        // Check mirror_drift (> 14 days between updated dates)
        diagnostics.push(...checkMirrorDrift(cn, en));

        break;
      }
    }
  }

  return diagnostics;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

interface PathInfo {
  directory: string;
  slug: string;
  isEn: boolean;
}

function splitPath(path: string): PathInfo {
  // path = "some/dir/file.en.md" or "some/dir/file.md"
  const lastSlash = path.lastIndexOf("/");
  const directory = lastSlash >= 0 ? path.slice(0, lastSlash) : "";
  const filename = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;

  let isEn: boolean;
  let slug: string;

  if (filename.endsWith(EN_SUFFIX)) {
    isEn = true;
    slug = filename.slice(0, -EN_SUFFIX.length);
  } else if (filename.endsWith(CN_SUFFIX)) {
    isEn = false;
    slug = filename.slice(0, -CN_SUFFIX.length);
  } else {
    // Not a markdown file, treat as CN
    isEn = false;
    slug = filename;
  }

  return { directory, slug, isEn };
}

function determinePairState(group: { cn?: Doc; en?: Doc }): PairState {
  if (group.cn && group.en) {
    return "paired";
  }
  if (group.cn && !group.en) {
    return "cn-only";
  }
  if (!group.cn && group.en) {
    // Check if EN has mirror_of — if so, it's an orphan_mirror
    if (group.en.frontmatter.mirror_of) {
      return "orphan_mirror";
    }
    return "en-only";
  }
  // Should never happen (no cn, no en)
  return "en-only";
}

function validateMirrorOf(en: Doc, pair: DocPair): DiagnosticRecord[] {
  const diagnostics: DiagnosticRecord[] = [];
  const mirrorOf = en.frontmatter.mirror_of;

  if (mirrorOf === undefined) {
    return diagnostics;
  }

  // Check: must be a relative path (no leading /)
  if (mirrorOf.startsWith("/")) {
    diagnostics.push(
      makeDiagnostic(en.path, "error", `mirror_of must be a relative path, got: "${mirrorOf}"`, {
        code: "mirror_of_absolute",
      }),
    );
    return diagnostics;
  }

  // Check: must point to the CN counterpart
  const expectedCN = `${pair.slug}.md`;
  if (mirrorOf !== expectedCN) {
    diagnostics.push(
      makeDiagnostic(
        en.path,
        "error",
        `mirror_of should point to CN counterpart "${expectedCN}", got: "${mirrorOf}"`,
        { code: "mirror_of_mismatch" },
      ),
    );
  }

  return diagnostics;
}

function checkMirrorDrift(cn: Doc, en: Doc): DiagnosticRecord[] {
  const cnDate = new Date(cn.frontmatter.updated);
  const enDate = new Date(en.frontmatter.updated);

  const diffMs = Math.abs(enDate.getTime() - cnDate.getTime());
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays > DRIFT_THRESHOLD_DAYS) {
    return [
      makeDiagnostic(
        en.path,
        "warning",
        `mirror_drift: updated dates differ by ${Math.round(diffDays)} days (CN="${cn.frontmatter.updated}", EN="${en.frontmatter.updated}")`,
        { code: "mirror_drift", drift_days: Math.round(diffDays) },
      ),
    ];
  }

  return [];
}

function makeDiagnostic(
  file: DocPath | undefined,
  severity: Severity,
  message: string,
  extra?: Record<string, string | number | boolean>,
): DiagnosticRecord {
  return {
    script: "bilingual-checker",
    severity,
    file: (file ?? "unknown") as DocPath,
    message,
    ...(extra ? { extra } : {}),
  };
}
