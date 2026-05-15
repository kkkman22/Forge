---
date: "2026-05-15"
topic: conflict-resolver-hook
tier: standard
phases: plan → build → review → test → ship → learn
outcome: success
---

Extracted forge-fix-conflicts into `src/conflict-resolver.ts` pure function facade.
Three-zone classification (frozen/guarded/open/source) + guarded merge + Three-Strike validation.
35 tests (23 unit + 5 PBT + 4 integration + 3 build-git-hook).
Fixed contract test regex to support `export async function`.
Branch merged to main, pushed.
