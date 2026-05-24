/**
 * SpecBundle filesystem I/O — load and write three-file / legacy-single bundles.
 *
 * Provides:
 *   - loadSpecBundle(featureDir): reads .forge/specs/<feature>/ and returns SpecBundle
 *   - writeSpecBundle(bundle, featureDir): writes SpecBundle to disk
 *
 * Validates: Requirements 1, 6
 */
import type { SpecBundle } from "./spec-bundle.js";
export interface LoadSpecBundleOptions {
    migrationHint?: boolean;
}
export declare function loadSpecBundle(featureDir: string, _options?: LoadSpecBundleOptions): SpecBundle & {
    migrationHint?: boolean;
};
export declare function writeSpecBundle(bundle: SpecBundle, featureDir: string): void;
