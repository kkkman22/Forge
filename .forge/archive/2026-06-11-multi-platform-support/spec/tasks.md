---
status: approved
feature: multi-platform-support
layout: tasks
created: 2026-04-29
spec_ref: ".forge/specs/multi-platform-support/requirements.md"
---

# Implementation Plan: Multi-AI Platform Support (v3.0)

## Overview

Extend Forge Loop to support multiple AI platforms via AgentRegistry and unified Agent protocol. Build on the existing `AgentInterface` abstraction. Provide MockAgentAdapter as reference implementation.

## Tasks

- [x] 1. Implement AgentRegistry (`src/agent-registry.ts`)
  - [x] 1.1 Create type definitions (`AgentFactory`, `AgentFactoryConfig`, `AgentRegistry`)
    - Define factory function type that accepts config and returns AgentInterface
    - Define config interface with common fields (cwd, outputSchema, timeoutMs, budgetUsd)
    - _Requirements: 1.2, 1.3_

  - [x] 1.2 Implement `createAgentRegistry()` factory function
    - Internal Map<string, AgentFactory> for storage
    - `register()`: store factory by name (overwrite on duplicate)
    - `resolve()`: lookup factory, call with config, return instance; throw descriptive error if not found
    - `listAgents()`: return sorted array of registered names
    - `has()`: check if name is registered
    - _Requirements: 1.2, 1.3, 1.4_

  - [x] 1.3 Implement `registerBuiltinAgents()` function
    - Register "claude" → SdkAgentAdapter factory
    - Register "mock" → MockAgentAdapter factory
    - _Requirements: 1.2_

  - [x] 1.4 Write property tests for AgentRegistry
    - Property 1: registration idempotency (re-register overwrites without error)
    - Property 2: unregistered name throws with available agent list
    - 200 iterations each
    - _Requirements: 1.2, 1.4_

- [x] 2. Implement MockAgentAdapter (`src/mock-agent-adapter.ts`)
  - [x] 2.1 Create MockAgentAdapter class implementing AgentInterface
    - Accept `MockAgentConfig` with response sequence, optional delay, optional loop flag
    - `run()`: return next response from sequence, apply delay if configured
    - `close()`: no-op
    - Handle sequence exhaustion: throw error if not looping, cycle if looping
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 2.2 Add detailed code comments explaining adapter implementation pattern
    - Document each AgentInterface method's responsibility
    - Document how to map platform-specific output to AgentOutput
    - Document TokenUsage handling for platforms without token metering
    - _Requirements: 4.3_

  - [x] 2.3 Write property test for Mock Agent response sequence (Property 3)
    - Generate response sequences and call counts
    - Assert responses returned in order, cycling when loop enabled
    - 200 iterations
    - _Requirements: 4.1_

  - [x] 2.4 Write unit tests for MockAgentAdapter
    - Test response sequence ordering
    - Test delay simulation
    - Test sequence exhaustion error (non-loop mode)
    - Test loop cycling behavior
    - Test abort signal handling
    - _Requirements: 4.1, 4.4_

- [x] 3. Checkpoint — Core modules complete
  - Ensure all tests pass
  - Verify MockAgentAdapter can drive SdkDriver through a complete loop

- [x] 4. CLI integration
  - [x] 4.1 Add `--agent <name>` option to forge-loop CLI
    - Default value: "claude"
    - Validate against registered agent names
    - Output available agents on invalid name
    - _Requirements: 1.1, 1.4_

  - [x] 4.2 Wire AgentRegistry into CLI action callback
    - Create registry, register builtins
    - Resolve agent by name from CLI option
    - Pass resolved agent to SdkDriver constructor
    - _Requirements: 1.1, 1.2_

  - [x] 4.3 Write unit tests for `--agent` CLI option
    - Test default "claude" selection
    - Test explicit agent selection
    - Test invalid agent name error with available list
    - _Requirements: 1.1, 1.4, 5.1_

- [x] 5. Agent protocol documentation
  - [x] 5.1 Create `docs/agent-protocol.md` documenting the unified protocol
    - Input format: prompt string, output schema, run options
    - Output format: AgentOutput fields, TokenUsage fields
    - Error handling: timeout, API error, validation failure
    - Platform-specific mapping guidance
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 5.2 Verify cross-platform state file compatibility
    - Confirm StatusFile has no platform-specific fields
    - Confirm Notes document has no platform-specific fields
    - Confirm SkillScheduler only depends on phase/tier
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 6. Final checkpoint
  - Run full test suite: `npm run check`
  - Verify `--agent claude` (default) behavior unchanged
  - Verify `--agent mock` runs a complete loop with MockAgentAdapter
  - Verify existing tests pass without modification
