# Saga / Process Manager Template

## When to Use

Use when a business process spans multiple aggregates or bounded contexts and requires coordinated multi-step actions with compensation (rollback) support. Sagas orchestrate long-running transactions where each step may fail independently, and earlier steps must be compensated.

Typical scenarios: `BookingSaga` (reserve room, charge payment, send confirmation), `OrderFulfillmentSaga` (reserve inventory, process payment, ship items), `GuestRegistrationSaga` (create profile, assign room, generate key card).

## Placeholders

| Placeholder | Type | Description | Example |
|---|---|---|---|
| `{{SagaName}}` | string | PascalCase name of the saga | `BookingSaga` |
| `{{Description}}` | string | One-line description of the business process | `Orchestrates the end-to-end hotel booking flow` |
| `{{States}}` | string[] | Array of possible state names | `["pending", "room_reserved", "payment_processed", "completed", "compensated"]` |
| `{{InitialState}}` | string | The starting state of the saga | `pending` |
| `{{CompensatedState}}` | string | The state after full compensation | `compensated` |
| `{{EventHandlers}}` | object[] | Array of `{ eventType, handlerName, transition, action, nextState }` | `[{ eventType: "RoomReserved", handlerName: "RoomReserved", transition: "pending -> room_reserved", action: "Record reservation, initiate payment", nextState: "room_reserved" }]` |

## Anti-patterns

- **Don't embed business logic in the saga.** The saga coordinates; aggregates enforce rules. The saga's job is routing events to the right actions.
- **Don't skip compensation steps.** Every forward action should have a corresponding compensation. Without it, partial failures leave the system in an inconsistent state.
- **Don't make sagas long-lived in memory.** Sagas should persist their state so they can survive process restarts.
- **Don't chain sagas.** If one saga needs to trigger another, use domain events as the glue, not direct calls.
- **Don't use sagas for simple request-response patterns.** If a single aggregate can handle the operation, use a domain service instead.
- **Don't ignore timeout handling.** Long-running sagas need timeout mechanisms to detect stuck processes and trigger compensation.
