# P0/P1 Fix Checklist — claude-code-uplift-2.1.153

## P0 Findings (Must Fix — Blocks Ship)

| # | ID | Description | File | Status |
|---|-----|-----------|------|--------|
| 1 | S-1 | Register 5 hook scripts in plugin.json | `.claude-plugin/plugin.json` | unfixed |
| 2 | S-2 | Implement hook exec form + if conditions (>=80% hooks) | `.claude-plugin/plugin.json` | unfixed |
| 3 | S-3 | Implement type:mcp_tool hooks for forge-context callers | `.claude-plugin/plugin.json` | unfixed |

## P1 Findings (Must Fix — Blocks Ship)

| # | ID | Description | File | Status |
|---|-----|-----------|------|--------|
| 4 | S-4 | Create forge-status + forge-restate bin scripts | `.claude-plugin/bin/` | unfixed |
| 5 | S-5 | Create docs/claude-code-compatibility.md | `docs/` | unfixed |
| 6 | S-6 | Update .claude/rules/hook-design-principles.md | `.claude/rules/` | unfixed |
| 7 | S-7 | Update README.md with compatibility + bin list | `README.md` | unfixed |
| 8 | Q-1 | Extract readStdin() to shared lib | `scripts/lib/` | unfixed |
| 9 | Q-2 | Flatten nesting in checkContextBoundary() | `scripts/postooluse-inject-warnings.mjs` | unfixed |
| 10 | Q-3 | Fix pathMatchesRule() to use globMatches() | `scripts/postooluse-inject-warnings.mjs` | unfixed |
