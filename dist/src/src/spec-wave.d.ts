/**
 * Wave scheduling — parseWaves, computeDependencyClosure.
 *
 * Pure functions for task dependency graph operations.
 *
 * Validates: Requirements 4
 */
import type { TaskSeed, Wave } from "./spec-bundle.js";
export declare function parseWaves(jsonBlock: string, tasks: TaskSeed[]): Wave[];
export declare function computeDependencyClosure(taskId: string, tasks: TaskSeed[]): string[];
