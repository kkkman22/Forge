# PoC Results: Single-Entry Dispatch via Agent + lib/instructions.md

**Date**: 2026-05-17
**Branch**: feature/forge-single-entry-poc
**Verdict**: ✅ **All three validation points PASS**

## V1: Agent can read lib/instructions.md ✅

**Method**: Sub-agent invoked with prompt to Read
`/Users/king/code/Forge/skills/forge/lib/zoom-out/instructions.md` and report
structural metadata as JSON.

**Result**:
```json
{"found": true, "section_count": 9, "first_heading": "1. 概述",
 "last_heading": "6. PoC 执行步骤", "char_count": 1569}
```

`section_count: 9` matches expected 6 real `## ` headings + 3 inside the
OUTPUT FORMAT code block. Character count alignes with file size.

**Conclusion**: Sub-agent has Read access to plugin path. Foundation works.

## V2: Agent executes per instructions.md directives ✅

**Method**: Sub-agent given prompt instructing it to read instructions.md and
execute the zoom-out workflow on topic = `skills/forge-status`.

**Result**: Sub-agent produced exactly the three-section format (整体位置 /
当前职责 / 与邻居的边界), each section ≤5 non-empty lines, with the required
PoC marker at the end. 4 tool calls used (within ≤5 budget). No files written.
No other forge skill triggered.

Content quality also confirmed: sub-agent actually read forge-status/SKILL.md
and understood routing relationships, data sources, and boundary skills — not
fabricated.

**Conclusion**: Instructions in lib/instructions.md are honored as if it were
a SKILL.md. Behavioral contract preserved.

## V3: Fresh-context isolation confirmed ✅

**Method**: Sub-agent asked three diagnostic questions:
1. What is the active editor file in current session?
2. What was discussed about the forge dispatcher in prior conversation?
3. Read PoC-PLAN.md and report its H1 heading.

**Result**:
- A1: "no prior context"
- A2: "no prior context"
- A3: "# PoC: Single-Entry Dispatch via Agent + lib/instructions.md" (correct)

**Conclusion**: Sub-agent has fresh context (cannot see main session state)
but retains filesystem access. This is exactly the `context: fork` semantics
the original SKILL frontmatter promised, achieved via Agent tool instead.

## Implications for Plan A

1. **Dispatch model is viable**. Agent + Read("lib/<phase>/instructions.md")
   produces equivalent behavior to Skill(forge-<phase>) with `context: fork`.

2. **Fresh-context discipline (forge-loop §13) becomes implementable for
   real**. Currently it's a dead-letter promise because
   `Skill(skill="forge", args=...)` syntax doesn't exist and
   `Skill(forge-loop)` is blocked by disable-model-invocation. Agent tool
   provides genuine fresh context per invocation.

3. **disable-model-invocation tradeoff resolves**. Sub-skills no longer need
   it because they're not skills anymore — they're markdown directive files
   loaded on demand. The bug observed in this very session (`Skill(forge-review)
   → Unknown skill`) is structurally fixed by Plan A.

4. **No surprises in Agent path resolution**. Plugin install path
   (`${CLAUDE_PLUGIN_ROOT}`) and workspace path both work via absolute paths
   inside Agent prompts. No special handling required.

## Risks Still Open (not invalidated by PoC, but deferred)

- **R-1 forge-build complexity**: zoom-out is 74 lines, simple, no internal
  references. forge-build is 239 lines with 18 references/. Migration of the
  big skills needs careful path rewriting in Wave 2.
- **R-2 nested Agent calls**: forge-decide already invokes its own agent
  team. After Plan A, `forge` dispatcher → Agent(decide) → Agent(architect)
  is a 3-level nesting. Need to verify Anthropic's recommended depth.
- **R-3 Agent prompt size**: Some skills like forge-loop (185 lines) become
  big Agent prompts. Need to monitor if prompt + Read(instructions) hits any
  effective context limit.

## Recommendation

Proceed to full-tier path:
1. `/forge decide` — confirm fork-vs-inline boundary, frontmatter migration
   rules, R-1/R-2/R-3 mitigation strategy
2. `/forge spec` — lock the 27-skill migration manifest, references rewrite
   rules, frozen frontmatter field mapping
3. `/forge plan` — 7-wave breakdown as outlined in prior turn
4. `/forge build` etc.

Do NOT cleanup PoC files yet — they prove the approach during decide/spec
phase. Cleanup after the full migration lands and tests pass.
