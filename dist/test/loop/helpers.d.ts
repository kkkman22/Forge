/**
 * Dynamically import a module from src/loop/.
 * Usage: `const { getNextPhase } = await loadLoopModule("phase-transitions");`
 */
export declare function loadLoopModule<T = Record<string, unknown>>(moduleName: string): Promise<T>;
