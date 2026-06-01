/**
 * Dynamically import a module from src/loop/.
 * Usage: `const { getNextPhase } = await loadLoopModule("phase-transitions");`
 */
export async function loadLoopModule(moduleName) {
    return import(`../../src/loop/${moduleName}.js`);
}
//# sourceMappingURL=helpers.js.map