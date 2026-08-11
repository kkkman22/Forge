---
updated: 2026-08-11
---
# Function Call Contracts (Detailed)

## checkBuildGate

**Signature**: `checkBuildGate(specStatus, planStatus)`

- **Parameters**:
  - `specStatus` — read from `status` field in `.forge/specs/<topic>/spec.md` YAML frontmatter
  - `planStatus` — read from `status` field in `.forge/plans/<topic>.md` YAML frontmatter
- **Returns**: `{ allowed: boolean, reasons: string[] }`; when `allowed: false`, `reasons` lists all failed gates
- **Purpose**: Programmatically verify Spec locked and Plan approved status, replacing manual per-item checks. When `allowed: false`, use §2 rejection output format

---

## checkBranchTopicGate

**Signature**: `checkBranchTopicGate(currentBranch, taskTopic)`

- **Parameters**:
  - `branchName` source: `git branch --show-current` output
  - `taskTopic` source: `current_task` field in `.forge/status.md`
- **Returns**: `{ allowed: boolean }`
  - `allowed: false` → Block build, output topic mismatch reason
  - `allowed: true` → Continue
- **Purpose**: Verify the current git branch matches the expected task topic before build execution

---

## detectUnshippedBranches

**Signature**: `detectUnshippedBranches(pendingDeliveries, currentTopic)`

- **Parameters**:
  - `pendingDeliveries` source: `PendingDeliveryRecord[]` read from persistence location
  - `currentTopic` source: current task topic
- **Returns**: Array of unshipped branch records (non-empty triggers warning)
- **Purpose**: Detect pending delivery records for branches that have not been shipped, showing a warning with three options:
  1. Ship immediately (switch to that branch and run `/tinkerman ship`)
  2. Continue on current branch (confirm to proceed with build)
  3. Switch to new branch (stop build, switch branch)

---

## detectStaleBranches

**Signature**: `detectStaleBranches(pendingDeliveries, currentTopic, currentTime)`

- **Parameters**:
  - `pendingDeliveries` source: `PendingDeliveryRecord[]` read from persistence location
  - `currentTopic` source: current task topic
  - `currentTime` source: `Date.now()`
  - `thresholdMs` configurable in `.forge/config.md` (default 0: any pending delivery with different topic is marked stale)
- **Returns**: Array of stale branch records (non-empty triggers warning)
- **Purpose**: Detect branches with pending deliveries that have gone stale relative to the current task

---

## checkCommitTopicMatch

**Signature**: `checkCommitTopicMatch(currentBranch, commitTopic)`

- **Parameters**:
  - `branchName` source: `git branch --show-current`
  - `commitTopic` source: current task topic
- **Returns**: `{ allowed: boolean }`
  - `allowed: false` → Block commit, output cross-topic contamination warning
  - `allowed: true` → Allow commit
- **Purpose**: Before each atomic commit, verify the commit topic matches the current branch to prevent cross-topic contamination

---

## buildResearchSubagents

**Signature**: `buildResearchSubagents(topics)`

- **Parameters**:
  - `topics` — research topic list (`string[]`, extracted from Plan research questions)
- **Returns**: `SubagentInvocation[]` (each containing prompt, subagent_type, and other config)
- **Purpose**: Construct parallel research Subagent invocation config, replacing manual per-item construction

---

## mergeResearchFindings

**Signature**: `mergeResearchFindings(results)`

- **Parameters**:
  - `results` — `SubagentResult[]` (return results from all research Subagents)
- **Returns**: Merged research findings string
- **Purpose**: Merge multiple parallel research results into unified document, write to `.forge/findings/<topic>.md`

---

## analyzeFixAttempts

**Signature**: `analyzeFixAttempts(sequence)`

- **Parameters**:
  - `sequence` — fix attempt sequence for current task (type `FixAttemptSequence`, containing each attempt's result and reason)
- **Returns**: `{ shouldEscalate: boolean, consecutiveFailures: number, escalationIndex: number }`
  - `shouldEscalate: true` triggers three-strike reroute
- **Purpose**: Programmatically determine consecutive failure count, decide whether to escalate to `/tinkerman debug`
