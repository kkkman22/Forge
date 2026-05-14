# Domain Service Template

## When to Use

Use when a business operation does not naturally belong to a single aggregate or value object. Domain services coordinate across multiple aggregates, enforce cross-cutting business rules, or perform operations that don't have a natural home in any entity. Keep them stateless; all state lives in the aggregates they orchestrate.

Typical scenarios: `TransferService` (moves money between accounts), `PricingService` (calculates price across room, season, and guest tiers), `BookingConflictService` (checks availability across reservations).

## Placeholders

| Placeholder | Type | Description | Example |
|---|---|---|---|
| `{{ServiceName}}` | string | PascalCase name of the domain service | `TransferService` |
| `{{Description}}` | string | One-line description of the service's responsibility | `Handles money transfers between accounts` |
| `{{AggregateNames}}` | string | Comma-separated aggregate class names to import | `Account, Transaction` |
| `{{Dependencies}}` | object[] | Array of `{ name, type }` for injected dependencies (usually repositories) | `[{ name: "accountRepo", type: "AccountRepository" }]` |
| `{{Methods}}` | object[] | Array of `{ methodName, params, returnType, description, body }` | `[{ methodName: "transfer", params: "from: string, to: string, amount: Money", returnType: "void", description: "Transfer funds between two accounts", body: "// implementation" }]` |

## Anti-patterns

- **Don't use domain services for CRUD operations.** If the operation belongs to a single aggregate, put it on the aggregate itself.
- **Don't store state in domain services.** Services are stateless orchestrators; all state lives in aggregates.
- **Don't mix application concerns.** No transaction management, no logging infrastructure, no HTTP awareness. Those belong in application services.
- **Don't create a "God Service" that knows every aggregate.** Keep services focused on a single cross-aggregate concern.
- **Don't bypass aggregate invariants.** Domain services should call aggregate methods, not directly manipulate aggregate state.
