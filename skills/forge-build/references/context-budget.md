# Context Budget Management (Detailed)

## Hard Token Limits (Iron Law)

The following limits are **mandatory constraints**, enforced at every tool output boundary. Use imperative language: MUST truncate, MUST replace, MUST NOT exceed.

| Source | Trigger | Max Tokens | Mandatory Action |
|--------|---------|-----------|-----------------|
| Explore Agent results | Always | 300 | MUST truncate to structured summary: entry points + dependency chain + tests + interfaces |
| Subagent execution results | Always | 200 | MUST replace full transcript with extract: status / task / changes / test result / commit hash / self-check |
| Test output (all pass) | All tests pass | 50 | Use `forge_exec` — server-side trimming extracts key lines + stats. Fallback: MUST replace with single line: `✅ <pass>/<total> tests passed (<duration>)` |
| Test output (failures) | Any test fails | 300 | Use `forge_exec` — failure output returned in full (iron rule). MUST keep only failure names + error messages. MUST discard all passing test details |
| Git diff | >50 lines | 200 | Use `forge_git("diff")` — server-side returns file-level summary. Fallback: MUST replace with file-level summary: filename + change type (added/modified/deleted) |
| Git status | >30 files | 200 | Use `forge_git("status")` — server-side returns categorized counts. Fallback: MUST replace with categorized summary |
| Command output | >100 lines | 200 | Use `forge_exec` — server-side extracts key lines + last 5 lines. Fallback: MUST keep last 20 lines + error/warning pattern matches |

## Structured Output Exemption

All Structured_Output formats are **exempt** from truncation regardless of token limits:
- TDD phase markers (🔴 RED / 🟢 GREEN / 🔵 REFACTOR)
- P5 evidence chains (`[Command] → [Output] → [Claim]`)
- Restatement summaries
- Closure-First Probe results
- Review reports

## Lifecycle Classification

| Information Source | Lifecycle | Handling |
|--------|---------|---------|
| Plan task list | Persistent | Retain in context, refresh at Restatement |
| Current task description | Persistent | Retain in context, refresh at Restatement |
| TDD cycle output | Phase-scoped | Retain for current phase, replace with summary at Restatement |
| Progress updates | Write-and-discard | After writing, only retain confirmation info |

## Trimming Execution Timing

1. After Explore Agent returns → MUST truncate to ≤300 tokens structured summary
2. After Subagent returns → MUST replace with ≤200 tokens extract
3. After test run → all pass: MUST replace with ≤50 tokens single line; failures: MUST keep only failures ≤300 tokens
4. After Git operation → diff >50 lines: MUST replace with file-level summary ≤200 tokens; status >30 files: MUST replace with categorized summary ≤200 tokens
5. After write-and-discard → replace full content with confirmation info

## Reflection Triggers

The following scenarios are **reasoning triggers** — when encountered, pause and ask yourself a question, then decide next steps based on the answer. Do not mechanically execute threshold judgments; combine with context for judgment.

| Trigger Scenario | Ask Yourself | Interactive Handling | Autonomous Handling |
|---------|--------|-----------------|----------------|
| Appending code to an already long file | Is the file taking on too many responsibilities? Does the new code align with core responsibilities? | Explain file responsibility scope to user, ask whether to split | Record to findings (path + responsibilities + split suggestion), continue execution |
| Adding method to a class with many methods | Is this class becoming a god class? Does the new method align with core abstraction? | Show method list and new method purpose, ask whether to extract | Record to findings (class name + method summary + extraction suggestion), continue |
| Adding `if (special case)` branch | Is this handling a legitimate business rule, or patching a design flaw? | Explain branch reason, ask whether to use strategy/polymorphism replacement | Record to findings (location + situation + alternative), continue |
| Copy-pasting code | Is there a common abstraction behind this? How many places need change if modified? | Show duplicated code, ask whether to extract shared function | Record to findings (location + content + extraction suggestion), continue |
| Adding 4+ parameters to a function | Can parameters be grouped? Is the function taking on too many responsibilities? | Show signature and new parameter, ask whether to introduce parameter object | Record to findings (signature + purpose + grouping suggestion), continue |
| Creating a new utility class | Do the functions have cohesion? Should they be distributed to domain modules? | Explain function list, ask whether to distribute by domain | Record to findings (class name + functions + attribution suggestion), continue |

**关键原则**：反射触发器触发**思考**，不触发**行动**。autonomous 模式下不自行拆分——记录观察，继续执行。
