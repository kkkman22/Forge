/**
 * Spec Leak Detector — scans spec text for banned patterns.
 *
 * detectSpecLeak: finds implementation/infra/framework/technical leaks in specs.
 *   - Skips content inside fenced code blocks (``` ... ```).
 *   - Checks glossary whitelist before emitting a finding.
 *
 * loadBannedPatterns: loads banned-patterns.yaml from all enabled layers and
 *   unions them into a single BannedPatternRegistry.
 */
import type { BannedPatternRegistry, EnabledPacks, FileSystem, GlossaryRegistry, LeakFinding } from "./pack/types.js";
/**
 * Scan spec text for banned patterns, emitting findings for each match
 * that is not whitelisted by the glossary for the given specContext.
 */
export declare function detectSpecLeak(specText: string, filePath: string, bannedRegistry: BannedPatternRegistry, glossary: GlossaryRegistry, specContext: string): LeakFinding[];
/**
 * Load banned-patterns.yaml from all enabled packs and the custom layer.
 * UNIONs all patterns across layers and deduplicates identical pattern strings.
 */
export declare function loadBannedPatterns(enabledPacks: EnabledPacks, fs: FileSystem): Promise<BannedPatternRegistry>;
