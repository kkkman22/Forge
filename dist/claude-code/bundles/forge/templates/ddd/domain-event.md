# Domain Event Template

## When to Use

Use when something significant happens in the domain that other parts of the system need to react to. Domain events represent facts that have already occurred (past tense naming: `OrderPlaced`, not `PlaceOrder`). They decouple aggregates from side effects and enable event-driven architectures.

Typical scenarios: `OrderPlaced`, `PaymentReceived`, `ReservationConfirmed`, `GuestCheckedIn`.

## Placeholders

| Placeholder | Type | Description | Example |
|---|---|---|---|
| `{{EventName}}` | string | PascalCase name of the event (past tense preferred) | `ReservationConfirmed` |
| `{{Description}}` | string | One-line description of when this event is raised | `Raised when a reservation is confirmed by the hotel` |
| `{{PayloadFields}}` | object[] | Array of `{ name, type }` for the event payload | `[{ name: "reservationId", type: "string" }, { name: "roomNumber", type: "string" }]` |

## Anti-patterns

- **Don't name events in present or imperative tense.** Use past tense (`OrderPlaced`, not `PlaceOrder`). Events represent facts that have already happened.
- **Don't include derived or computed data in the payload.** Include only the essential data needed by consumers; they can derive the rest.
- **Don't make payloads mutable.** The `Object.freeze()` in the constructor is intentional; events are immutable records of things that happened.
- **Don't use events for synchronous request-response.** Events are for notification, not queries. If you need a response, use a direct method call or query.
- **Don't couple event publishers to subscribers.** The publisher should not know or care who handles the event.
