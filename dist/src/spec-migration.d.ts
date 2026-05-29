/**
 * Auto migration logic — spec.md → three files.
 *
 * migrateLegacySpec: detects legacy spec.md, splits into three files,
 * renames original to spec.legacy.md, writes migrated_from frontmatter.
 * Also handles .forge/plans/<topic>.md migration.
 * Includes rollback on failure.
 *
 * Validates: Requirements 7, 8, 9
 */
export interface MigrationResult {
    success: boolean;
    skipped?: boolean;
    error?: string;
}
export declare function migrateLegacySpec(featureDir: string, eventsPath?: string): MigrationResult;
