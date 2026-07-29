/**
 * Shared types for the spec subsystem.
 *
 * Extracted from `spec.ts` to break the circular dependency between
 * `spec.ts` and `spec-bundle.ts` (and the spec-* siblings that fan out from
 * spec-bundle). Previously `spec-bundle.ts` imported `SpecDocument` from
 * `spec.ts`, while `spec.ts` imported `SpecBundle` / re-exported `SpecKind`
 * from `spec-bundle.ts` — the hub back-edge that rooted 7 of the 11 cycles.
 * Moving the document-level types here lets both sides import from this
 * dependency-free leaf, collapsing the spec.ts cluster.
 *
 * Repo precedent: `router-types.ts`, `session-types.ts`, `grill/types.ts`.
 */

export interface SpecFrontmatter {
  feature: string;
  status: "draft" | "locked";
  date: string;
  /** External spec source path (import mode only). */
  importSource?: string;
}

export interface Requirement {
  title: string;
  description: string;
  scenarios: string[]; // Each scenario in "当...则..." format
}

export interface DeltaSection {
  added: string[]; // 新增
  modified: string[]; // 修改
  unchanged: string[]; // 不变
}

export interface SpecDocument {
  frontmatter: SpecFrontmatter;
  purpose: string;
  requirements: Requirement[];
  exclusions: string[]; // 不做什么
  delta?: DeltaSection; // Only for brownfield
  isBrownfield: boolean;
}
