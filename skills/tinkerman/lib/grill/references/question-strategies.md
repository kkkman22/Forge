---
updated: 2026-08-11
---
# Question Strategies

Guidance for driving the Socratic grill loop. These strategies govern how the
skill *presents* and *sequences* questions; tree generation itself is pure and
lives in `src/grill.ts`.

## One Question at a Time

Never batch questions. A single prompt with multiple bullets lets users answer
only the easiest, leaving silent ambiguity on the harder branches. Batched
prompts defeat the whole point of grilling.

## Order of Pursuit

`selectNextQuestion` walks roots in fixed order (functionality → boundary →
dependency → assumption → non_goal), descending into children only when the
parent is `resolved`. This shape is intentional:

- **functionality first** locks the positive scope before negative boundaries
- **boundary second** forces "what will you NOT build"
- **dependency third** surfaces integration constraints while scope is fresh
- **assumption fourth** catches implicit preconditions before the user commits
- **non_goal last** is the sanity check that nothing leaked back into scope

## Code-first Resolution

If a question is answerable from the codebase (existing implementation, current
configuration, a glossary-defined term), dispatch a read-only explore subagent
instead of asking the user. Rules of thumb:

- "What is the current behavior of X?" → explore, never ask
- "What should the new behavior of X be?" → ask
- "Is term Y already defined?" → glossary lookup, never ask
- "Does file Z exist / what does it export?" → explore, never ask

When the explore agent answers, record it as the `userAnswer` and mark the node
`resolved` with a prefix like `[code-resolved] ...`. This keeps the audit trail
distinct from human answers.

## AI Suggestion Discipline

Every `aiSuggestion` is a *draft* the user may accept verbatim. Keep suggestions:

- Specific enough to show you understand the ask (not "TBD")
- Neutral — never advocate for an option when the tradeoff is a user decision
- Short — one sentence is ideal, two is the ceiling

If the suggestion would need to become a paragraph, that signals the question is
too broad. Split it into child nodes and keep the parent generic.

## Dig-Deeper Requests

When the user replies `再挖深点` / `dig deeper` / `grill harder`, do not simply
repeat the same question. Instead:

1. Accept the last answer as partial
2. Insert a follow-up child under the current node with a narrower question
3. Continue the loop

The follow-up is typically a "why" or a "what if" question — it challenges the
most fragile part of the previous answer, not the most obvious.

## Termination Signals

Exit the loop as soon as `isComplete(tree) === true`. Do not ask a "final
confirmation" question — the `## Alignment Summary` section of the findings
serves that purpose. Users who want to continue can always run `/tinkerman grill`
again with a refined description.
