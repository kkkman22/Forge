# Business Context: An invoice may need to be voided due to errors or changed
# circumstances. Voiding must maintain sequential invoice number integrity and
# preserve a complete audit trail for tax compliance.
# Assumes: Invoice numbers are sequential and cannot be reused, voided invoices
# are marked rather than deleted, a reason is required for every void.
Feature: Void invoice
  Scenario: Invoice voided with reason and audit trail preserved
    Given invoice number INV-2026-1042 has been generated for a guest stay.
    And the invoice total is $550.00 including tax.
    And the front desk manager authorizes the void.
    When the invoice is voided with the reason Duplicate Invoice Issued.
    Then invoice INV-2026-1042 is marked as voided.
    And the voided invoice is retained in the system with all original details.
    And the void reason and authorizing manager are recorded.
    And the sequential invoice number INV-2026-1042 is not reused.
    And a new invoice is generated with the next sequential number INV-2026-1043.
    And the void is reflected in the daily revenue and tax reports.

  Scenario: Void rejected without authorization
    Given a front desk agent attempts to void invoice INV-2026-1050.
    And invoice voids require manager-level authorization.
    When the agent submits the void without manager approval.
    Then the void is rejected with an authorization required message.
    And the invoice INV-2026-1050 remains in active status.
    And the rejected void attempt is logged in the audit trail.
