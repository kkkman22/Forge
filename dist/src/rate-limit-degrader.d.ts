export declare class RateLimitDegrader {
    private readonly initialLimit;
    private readonly toolHealthPath;
    private readonly subcommand;
    private degradationCount;
    private currentLimit;
    constructor(initialLimit: number, toolHealthPath: string, subcommand: string);
    /** Called when a 429 is observed. Returns the new concurrency limit. */
    on429(): number;
    /** Reset at end of subcommand — restores initial state and clears env. */
    reset(): void;
    getCurrentLimit(): number;
    private appendToolHealth;
}
