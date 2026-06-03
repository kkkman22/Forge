/**
 * @file Shared test utilities for loop module tests.
 * Eliminates duplicated dynamic-import patterns across test files.
 */
/**
 * @file Shared test utilities for loop module tests.
 * Eliminates duplicated dynamic-import patterns across test files.
 */
/**
 * Dynamically import a module from src/loop/.
 * Usage: `const { getNextPhase } = await loadLoopModule("phase-transitions");`
 */
export async function loadLoopModule(moduleName) {
    return import(`../../src/loop/${moduleName}.js`);
}
//# sourceMappingURL=helpers.js.map