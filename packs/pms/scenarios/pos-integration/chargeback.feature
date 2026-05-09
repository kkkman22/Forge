# Business Context: A guest may dispute a POS charge that was posted to their
# folio. The chargeback process initiates an investigation, and the folio is
# adjusted while the dispute is pending resolution.
# Assumes: The charge has already been posted and settled, the dispute process
# is defined by the hotel's chargeback policy, the folio balance is adjusted
# provisionally during investigation.
Feature: Chargeback for POS charge
  Scenario: Guest disputes a restaurant charge on the folio
    Given a guest has checked out and the folio is settled.
    And a restaurant charge of $45.00 was posted during the stay.
    When the guest contacts the hotel to dispute the $45.00 charge.
    And the front desk agent initiates a chargeback request.
    Then the charge is flagged as disputed on the folio.
    And a provisional credit of $45.00 is applied to the guest's folio.
    And the chargeback reason is recorded with the dispute details.
    And the restaurant manager is notified for investigation.

  Scenario: Disputed charge resolved in favor of the guest
    Given a chargeback request is pending for a $45.00 restaurant charge.
    And the investigation confirms the charge was incorrect.
    When the chargeback is resolved in favor of the guest.
    Then the $45.00 charge is permanently reversed on the folio.
    And a refund of $45.00 is issued to the guest's payment method.
    And the chargeback is closed with a resolution code.
    And the adjustment is reflected in the restaurant's daily revenue report.

  Scenario: Disputed charge resolved in favor of the hotel
    Given a chargeback request is pending for a $45.00 restaurant charge.
    And the investigation confirms the charge was valid with a signed receipt.
    When the chargeback is resolved in favor of the hotel.
    Then the provisional credit is reversed on the folio.
    And the original charge of $45.00 stands.
    And the chargeback is closed with supporting documentation.
