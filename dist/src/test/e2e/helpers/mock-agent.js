function createMockUsage(overrides) {
    return {
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 10,
        cacheCreationTokens: 5,
        ...overrides,
    };
}
/**
 * Programmable agent mock for E2E tests.
 * Returns responses in sequence from the provided script, then repeats the last one.
 */
export class ScriptedAgent {
    script;
    name = "scripted-agent";
    callCount = 0;
    constructor(script) {
        this.script = script;
    }
    async run(_prompt, _cwd, _options) {
        const response = this.script[this.callCount] ?? this.script.at(-1) ?? { kind: "stop" };
        this.callCount++;
        switch (response.kind) {
            case "success":
                return {
                    output: {
                        success: true,
                        summary: response.summary ?? "mock success",
                        key_changes_made: response.keyChanges ?? ["mock change"],
                        key_learnings: response.keyLearnings ?? [],
                    },
                    usage: createMockUsage(response.usage),
                };
            case "failure":
                return {
                    output: {
                        success: false,
                        summary: response.errorMessage ?? "mock failure",
                        key_changes_made: [],
                        key_learnings: [],
                    },
                    usage: createMockUsage(response.usage),
                };
            case "stop":
                return {
                    output: {
                        success: true,
                        summary: response.summary ?? "target reached",
                        key_changes_made: response.keyChanges ?? ["final change"],
                        key_learnings: [],
                        should_fully_stop: true,
                    },
                    usage: createMockUsage(response.usage),
                };
        }
    }
    async close() {
        // No-op
    }
    get invocationCount() {
        return this.callCount;
    }
}
//# sourceMappingURL=mock-agent.js.map