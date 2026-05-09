# Aggregate Root Template

## When to Use

Use when modeling a consistency boundary in your domain. An aggregate root is the entry point for a cluster of related objects that must be consistent together. Every transaction should modify only one aggregate root; use domain events to coordinate changes across aggregates.

Typical scenarios: Order (with OrderLines), Reservation (with Guests), Account (with Transactions).

## Placeholders

| Placeholder | Type | Description | Example |
|---|---|---|---|
| `{{AggregateName}}` | string | PascalCase name of the aggregate | `Reservation` |
| `{{Description}}` | string | One-line description of the aggregate's purpose | `Hotel room reservation` |
| `{{EventNames}}` | string | Comma-separated domain event class names to import | `ReservationCreated, ReservationCancelled` |
| `{{Invariants}}` | string[] | List of invariant descriptions for documentation | `["Room must be available", "Dates must not overlap"]` |
| `{{Fields}}` | object[] | Array of `{ name, type }` for private fields | `[{ name: "id", type: "string" }]` |
| `{{FactoryMethodName}}` | string | Static factory method name | `create` |
| `{{FactoryParams}}` | object[] | Array of `{ name, type }` for factory parameters | `[{ name: "roomId", type: "string" }]` |
| `{{InvariantChecks}}` | object[] | Array of `{ condition, message }` for guard clauses | `[{ condition: "roomId.length > 0", message: "Room ID required" }]` |
| `{{FactoryArgs}}` | string[] | Arguments passed to the private constructor | `["roomId", "guestId", "checkIn", "checkOut"]` |
| `{{HasEvents}}` | boolean | Whether the aggregate publishes events on creation | `true` |
| `{{FirstEventName}}` | string | Name of the first domain event published | `ReservationCreated` |
| `{{StateTransitions}}` | object[] | Array of `{ methodName, params, preCondition, guard, errorMessage }` | `[{ methodName: "cancel", params: "", preCondition: "not already cancelled", guard: "this._status !== 'cancelled'", errorMessage: "Already cancelled" }]` |
| `{{Serialization}}` | boolean | Whether to include a `toJSON()` method | `true` |

## Anti-patterns

- **Don't reference other aggregate roots directly.** Use IDs and domain events for cross-aggregate coordination.
- **Don't put persistence logic in the aggregate.** Repositories handle storage; aggregates express business rules.
- **Don't make aggregate roots too large.** If an aggregate exceeds ~10 methods, consider splitting into separate aggregates linked by events.
- **Don't bypass the factory method.** The private constructor enforces invariants; always create instances through the static factory.
- **Don't add getters for mutable state.** Prefer methods that express intent (e.g., `cancel()` instead of `setStatus("cancelled")`).
