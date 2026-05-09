# Business Context: When a POS item is voided at the restaurant terminal,
# the void must be synchronized to the PMS so the charge is removed from the
# guest's folio. A complete audit trail must be preserved.
# Assumes: The POS and PMS are integrated in real-time, void transactions
# carry authorization and reason codes, audit trails are immutable.
Feature: Item void synchronization
  Scenario: Voided POS item removes charge from guest folio
    Given a guest in room 608 has a $35.00 restaurant charge on the folio.
    And the restaurant manager authorizes the void.
    When the waiter voids the $35.00 item at the POS terminal.
    And selects the reason code as Incorrect Order.
    Then the $35.00 charge is removed from room 608's folio.
    And a void entry is created showing the original charge and the void.
    And the void includes the authorizing manager's identity.
    And the void includes the reason code and timestamp.
    And the folio balance is reduced by $35.00.

  Scenario: Void rejected without proper authorization
    Given a waiter attempts to void a $50.00 charge at the POS terminal.
    And the void requires manager authorization for amounts over $25.00.
    When the waiter submits the void without manager approval.
    Then the void is rejected with an authorization required message.
    And the original charge remains on the guest's folio.
    And the rejected void attempt is logged for audit purposes.
