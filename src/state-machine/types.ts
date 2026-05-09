/**
 * State machine type definitions.
 *
 * Defines data structures for declarative state machine definitions:
 *   - StateMachineDefinition: YAML schema → in-memory representation
 *   - ValidationReport: loader/validator output
 *   - TransitionSpec: a single state transition rule
 *   - InvariantSpec: a domain invariant expressed in minimal DSL
 *
 * @public
 */

/** A single state in the state machine. */
export interface StateSpec {
  /** State name (unique within the machine). */
  name: string;
  /** Human-readable description. */
  description: string;
  /** Whether this is a terminal (sink) state. */
  terminal?: boolean;
}

/** A single transition rule. */
export interface TransitionSpec {
  /** Source state name. */
  from: string;
  /** Target state name. */
  to: string;
  /** Event that triggers this transition. */
  event: string;
  /** Named preconditions (string identifiers interpreted by business code). */
  guards?: string[];
  /** Named side effects triggered on successful transition. */
  sideEffects?: string[];
}

/** A domain invariant expressed in minimal DSL. */
export interface InvariantSpec {
  /** DSL expression (e.g., "terminal_state_has_no_outgoing_transitions"). */
  expression: string;
  /** Human-readable description of the invariant. */
  description: string;
}

/** Full state machine definition parsed from YAML. */
export interface StateMachineDefinition {
  /** Machine name (kebab-case, unique). */
  name: string;
  /** Human-readable description. */
  description: string;
  /** Declared states. */
  states: StateSpec[];
  /** Initial state name. */
  initial: string;
  /** Transition rules. */
  transitions: TransitionSpec[];
  /** Domain invariants. */
  invariants: InvariantSpec[];
}

/** A single validation error or warning. */
export interface ValidationEntry {
  /** Machine-readable error code (e.g., "ST001"). */
  code: string;
  /** Human-readable message. */
  message: string;
}

/** Result of validating a StateMachineDefinition. */
export interface ValidationReport {
  /** Whether the definition passes all checks. */
  valid: boolean;
  /** Blocking errors. */
  errors: ValidationEntry[];
  /** Non-blocking warnings. */
  warnings: ValidationEntry[];
}
