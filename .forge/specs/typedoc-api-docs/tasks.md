---
feature: typedoc-api-docs
layout: tasks
created: 2026-04-28
spec_ref: ".forge/specs/typedoc-api-docs/requirements.md"
---

# Implementation Plan: API Documentation Generation (TypeDoc)

## Overview

Integrate TypeDoc into the Forge Loop project to generate HTML API reference documentation from `src/` TypeScript source files. This is a configuration-only feature — no runtime code changes. Tasks cover dependency installation, configuration, npm script, gitignore update, CI integration, and verification.

## Tasks

- [x] 1. Install TypeDoc as a dev dependency
  - Run `npm install --save-dev --save-exact typedoc@0.28.4` to add TypeDoc with exact version pinning
  - Verify `package.json` lists `"typedoc": "0.28.4"` in `devDependencies` (no `^` or `~` prefix)
  - Verify `package-lock.json` is updated
  - _Requirements: 1.1, 1.4, 9.2_

- [x] 2. Create TypeDoc configuration file
  - [x] 2.1 Create `typedoc.json` in the project root with the following settings:
    - `entryPoints`: `["src/"]`
    - `entryPointStrategy`: `"expand"`
    - `out`: `"docs/api"`
    - `cleanOutputDir`: `true`
    - `tsconfig`: `"tsconfig.json"`
    - `name`: `"Forge Loop"`
    - `excludeInternal`: `true`
    - `exclude`: `["test/**/*.ts"]`
    - `treatWarningsAsErrors`: `true`
    - `validation`: `{ "notExported": true, "invalidLink": true }`
    - _Requirements: 1.2, 2.4, 3.1, 3.2, 3.3, 4.1, 6.1, 7.1, 7.2, 7.3, 8.3_

- [x] 3. Add `docs` script to package.json
  - Add `"docs": "typedoc"` to the `scripts` section of `package.json`
  - Do NOT modify any existing scripts (`test`, `lint`, `typecheck`, `check`, etc.)
  - _Requirements: 2.1, 9.1, 9.3_

- [x] 4. Update `.gitignore` to exclude generated docs
  - Append `docs/api/` to the `.gitignore` file
  - Ensure the entry is on its own line with a descriptive comment
  - _Requirements: 6.2, 6.4_

- [x] 5. Add documentation generation step to CI workflow
  - [x] 5.1 Add a `Verify docs generation` step in `.github/workflows/ci.yml`
    - Insert `- name: Verify docs generation` with `run: npm run docs`
    - Place it in the `check` job after the `npm run lint` step and before `npm run test:coverage`
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 6. Checkpoint - Verify the integration works end-to-end
  - Run `npm run docs` locally and confirm it exits with code 0
  - Confirm `docs/api/index.html` is generated
  - Confirm existing scripts still work: `npm run typecheck`, `npm run lint`, `npm run test`
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 2.2, 2.3, 6.3, 9.1_

## Notes

- No property-based tests are needed — this is a configuration-only feature with no code logic
- All tasks reference specific requirements for traceability
- The checkpoint ensures incremental validation before considering the feature complete
- TypeDoc version 0.28.4 is pinned exactly, matching the project's existing dependency strategy
