# Value Object Template

## When to Use

Use when modeling a domain concept defined entirely by its attributes rather than a unique identity. Value objects are immutable and compared by value equality. They encapsulate validation rules and domain constraints at the type level.

Typical scenarios: Money (amount + currency), DateRange (start + end), EmailAddress, Address.

## Placeholders

| Placeholder | Type | Description | Example |
|---|---|---|---|
| `{{ValueObjectName}}` | string | PascalCase name of the value object | `Money` |
| `{{Description}}` | string | One-line description of the value object's purpose | `Monetary amount with currency` |
| `{{Fields}}` | object[] | Array of `{ name, type }` for private fields | `[{ name: "amount", type: "number" }, { name: "currency", type: "string" }]` |
| `{{Validations}}` | object[] | Array of `{ condition, message }` for constructor validation | `[{ condition: "amount >= 0", message: "Amount cannot be negative" }]` |
| `{{SingleField}}` | boolean | Whether the value object has only one field (affects `toString()`) | `true` |
| `{{MultipleFields}}` | boolean | Whether the value object has multiple fields (affects `toString()`) | `false` |
| `{{FirstFieldName}}` | string | Name of the first field, used when `SingleField` is true | `amount` |

## Anti-patterns

- **Don't add mutable state.** Value objects must be immutable. Return new instances from transformation methods.
- **Don't compare by reference.** Always use the `equals()` method for comparisons; two value objects with identical fields are the same.
- **Don't skip validation.** Constructor validation is the primary purpose of a value object. Without it, you have a plain data holder.
- **Don't use value objects as entity identifiers.** Entity IDs should be simple types or dedicated identity value objects with no business validation.
- **Don't put business logic that depends on external state in value objects.** They should be self-contained and deterministic.
