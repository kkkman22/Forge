# Business Context: Express check-out allows a guest to leave without visiting
# the front desk. The system auto-settles the folio and delivers the final invoice.
# Assumes: Guest has a valid payment method on file, no outstanding disputed charges,
# express check-out is enabled at the property level.
Feature: Express check-out
  Scenario: Guest uses express check-out via key card drop
    Given a guest is currently In-House with a valid credit card on file
    And the guest has no disputed charges on the folio
    And express check-out is enabled for the property
    When the guest drops the key card in the express check-out slot
    Then the system initiates express check-out processing
    And the folio is settled using the credit card on file
    And a final invoice is emailed to the guest
    And the room status changes to Dirty
    And the reservation status changes to Checked-Out

  Scenario: Express check-out blocked due to outstanding charges
    Given a guest is currently In-House
    And the guest has an open minibar charge that has not been posted
    When the guest attempts express check-out
    Then the system blocks the express check-out
    And the guest is notified to visit the front desk
    And the folio is not settled
    And the reservation remains In-House
