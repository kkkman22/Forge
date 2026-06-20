/**
 * Forbidden test/browser framework packages. Adding any of these to Forge's
 * package.json dependencies or devDependencies breaks R6.5. Extend this list
 * when new test frameworks appear; do NOT remove entries without an ADR.
 */
export declare const FORBIDDEN_TEST_DEPS: readonly string[];
