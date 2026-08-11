---
updated: 2026-08-11
title: "Scenario Format Reference"
version: "1.0"
---

# Acceptance Scenario Format

## Explicit Scenarios

Defined in `## Scenarios` section of spec using Gherkin syntax:

```markdown
## Scenarios

@critical
Scenario: User login flow
Given the login page is open at /login
When the user enters valid credentials and clicks submit
Then the dashboard is shown at /dashboard

### Scenario: API health check
Given the API endpoint is /health
When a GET request is sent
Then the response status is 200
```

Tags: `@critical` (always run, blocks ship), `@happy-path` (high priority), `@promote-derived` (include derived in blocking set).

## Implicit (Derived) Scenarios

Auto-extracted from `## Acceptance Criteria` using WHEN/SHALL pattern:

```markdown
## Acceptance Criteria

- WHEN the user clicks submit, THE system SHALL process the form and return status 200
- WHEN the API receives a GET /health request, THE server SHALL respond with status 200
```

Derived scenarios have confidence=0.7 and source="derived". They don't block ship unless `--promote-derived` is used.
