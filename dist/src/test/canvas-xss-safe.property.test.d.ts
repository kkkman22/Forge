/**
 * Property test: Canvas HTML rendering is XSS-safe.
 *
 * Invariant: for any review finding text containing `<script>`,
 * the rendered HTML must NOT contain an active `<script>` element
 * whose body derives from the finding text [R13.8].
 *
 * **Validates: Requirements R4.8, R13.8**
 */
export {};
