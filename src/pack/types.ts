/**
 * Pack system core type definitions.
 *
 * Defines data structures for the pluggable Domain Pack mechanism:
 *   - PackManifest: pack.yaml schema
 *   - PackEntry: discovered pack with resolved paths
 *   - PackRegistry: in-memory index of all packs
 *   - EnabledPacks: project-level enabled pack configuration
 *
 * **Validates: R1 Pack discovery, R2 Project-level enablement**
 */

// ---------------------------------------------------------------------------
// Pack Manifest (packs/<name>/pack.yaml)
// ---------------------------------------------------------------------------

/** Known extends categories that Forge recognizes. */
export type PackExtendsCategory =
  | "contexts"
  | "glossary"
  | "scenarios"
  | "state_machines"
  | "banned_patterns"
  | "lint_rules"
  | "templates"
  | "agents"
  | "utils";

/** Raw manifest parsed from pack.yaml. */
export interface PackManifest {
  /** Unique kebab-case identifier matching directory name. Required. */
  name: string;
  /** Human-readable name. Required. */
  display_name: string;
  /** Description of the pack's purpose. Required. */
  description: string;
  /** Minimum Forge version (semver). Required. */
  forge_min_version: string;
  /** Names of other packs this pack depends on. Optional. */
  depends_on?: string[];
  /** Category → relative directory path mapping. Required. */
  extends: Partial<Record<PackExtendsCategory, string>>;
  /** Pack-specific configuration hints. Optional. */
  feature_flags?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Pack Entry (resolved, with absolute paths)
// ---------------------------------------------------------------------------

/** A discovered pack with resolved paths and validation status. */
export interface PackEntry {
  /** Unique kebab-case identifier. */
  name: string;
  /** Human-readable name. */
  displayName: string;
  /** Description of the pack's purpose. */
  description: string;
  /** Minimum Forge version (semver). */
  forgeMinVersion: string;
  /** Names of packs this pack depends on. */
  dependsOn: string[];
  /** Category → absolute path mapping. */
  extends: Record<string, string>;
  /** Pack-specific configuration hints. */
  featureFlags: Record<string, unknown>;
  /** Absolute path to pack.yaml. */
  manifestPath: string;
  /** Absolute path to pack root directory. */
  rootPath: string;
}

// ---------------------------------------------------------------------------
// Pack Registry (in-memory index)
// ---------------------------------------------------------------------------

/** In-memory index of all discovered packs. Pure data, no methods. */
export interface PackRegistry {
  /** Packs keyed by name. */
  packs: Map<string, PackEntry>;
  /** Discovery/parse warnings. */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Enabled Packs (project-level configuration)
// ---------------------------------------------------------------------------

/** Project-level enabled pack configuration with resolution context. */
export interface EnabledPacks {
  /** Pack names in declaration order (first = highest priority). */
  order: string[];
  /** Resolved pack entries corresponding to order. */
  entries: PackEntry[];
  /** Absolute path to .tinkerman/custom/ directory. */
  customLayerRoot: string;
}

// ---------------------------------------------------------------------------
// Banned Pattern types (for Spec Leak Detector)
// ---------------------------------------------------------------------------

/** A single banned pattern entry. */
export interface BannedPattern {
  /** Pattern string (literal) or "regex:<expr>". */
  pattern: string;
  /** Why this pattern is banned. */
  description: string;
  /** Optional rewrite suggestion template. */
  suggestion_template?: string;
}

/** Banned patterns organized by category. */
export interface BannedPatternRegistry {
  /** Category → patterns. */
  categories: Map<string, BannedPattern[]>;
}

// ---------------------------------------------------------------------------
// Context types (for Bounded Context engine)
// ---------------------------------------------------------------------------

/** A single Bounded Context definition. */
export interface ContextEntry {
  name: string;
  responsibility: string;
  aggregates: string[];
  inboundEvents: string[];
  outboundEvents: string[];
  upstream: string[];
  downstream: string[];
  sourcePath: string;
  sourceLayer: "custom" | `pack:${string}` | "core";
  body: string;
}

/** Context map relationship types (DDD strategic patterns). */
export type ContextMapType =
  | "partnership"
  | "customer-supplier"
  | "conformist"
  | "acl"
  | "open-host"
  | "published-language"
  | "shared-kernel";

/** An edge in the context map. */
export interface ContextMapEntry {
  source: string;
  target: string;
  type: ContextMapType;
  sourceLayer: string;
}

/** Combined context registry with map. */
export interface ContextRegistry {
  contexts: Map<string, ContextEntry>;
  map: ContextMapEntry[];
}

// ---------------------------------------------------------------------------
// Glossary types
// ---------------------------------------------------------------------------

/** A single glossary term entry. */
export interface GlossaryEntry {
  term: string;
  context: string;
  definition: string;
  aliases: string[];
  updated: string;
  source: string | null;
  sourcePath: string;
  sourceLayer: "custom" | `pack:${string}` | "core";
}

/** Glossary registry keyed by context::term and by term. */
export interface GlossaryRegistry {
  entries: Map<string, GlossaryEntry>;
  byTerm: Map<string, GlossaryEntry[]>;
}

// ---------------------------------------------------------------------------
// Leak Finding (Spec Leak Detector output)
// ---------------------------------------------------------------------------

/** Leak finding category. */
export type LeakCategory = "code" | "infrastructure" | "framework" | "technical";

/** A single spec leak finding. */
export interface LeakFinding {
  category: LeakCategory;
  file: string;
  line: number;
  original: string;
  matchedTerm: string;
  suggestedRewrite: string | null;
  sourceLayer: string;
}

// ---------------------------------------------------------------------------
// Lint Finding (Scenario Linter output)
// ---------------------------------------------------------------------------

/** A single scenario lint finding. */
export interface LintFinding {
  ruleId: string;
  severity: "error" | "warning";
  file: string;
  line: number;
  message: string;
}

// ---------------------------------------------------------------------------
// FileSystem interface (for DI / testing)
// ---------------------------------------------------------------------------

/** Minimal filesystem interface for pack system IO injection. */
export interface FileSystem {
  readdir(path: string): Promise<string[]>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<{ isFile(): boolean; isDirectory(): boolean }>;
}
