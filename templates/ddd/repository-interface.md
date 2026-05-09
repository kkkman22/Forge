# Repository Interface Template

## When to Use

Use when defining the persistence contract for an aggregate root. The repository interface belongs to the domain layer; its implementation belongs to the infrastructure layer. This separation keeps the domain free of persistence concerns and allows swapping storage technologies.

Typical scenarios: `OrderRepository`, `GuestRepository`, `RoomRepository`.

## Placeholders

| Placeholder | Type | Description | Example |
|---|---|---|---|
| `{{AggregateName}}` | string | PascalCase name of the aggregate this repository manages | `Reservation` |
| `{{Description}}` | string | One-line description of the repository's scope | `Persistence contract for Reservation aggregate` |
| `{{AggregateNameFilename}}` | string | Kebab-case or PascalCase filename of the aggregate module (without extension) | `Reservation` |
| `{{CustomQueries}}` | object[] | Array of `{ Name, params }` for domain-specific query methods | `[{ Name: "GuestId", params: "guestId: string" }]` |

## Anti-patterns

- **Don't put implementation details in the interface.** No SQL, no ORM-specific types, no storage concerns. The interface is a domain-level contract.
- **Don't add generic query methods like `findAll()` without domain justification.** Every method should correspond to a genuine use case, not speculative convenience.
- **Don't return partial objects.** Repositories should return fully reconstituted aggregates, not DTOs or half-loaded entities.
- **Don't add business logic to repository implementations.** The repository is a collection-like abstraction; business rules belong in the aggregate or domain services.
- **Don't bypass the repository to access aggregate data directly.** All aggregate persistence must flow through the repository interface.
