export type Zone = "frozen" | "guarded" | "open" | "source";
/**
 * Normalize a path: strip trailing slashes, then strip leading "./".
 */
export declare function normalizePath(p: string): string;
/**
 * Classify a path into one of four zones.
 * Total function — always returns a valid Zone [R13.1].
 */
export declare function classify(path: string): Zone;
