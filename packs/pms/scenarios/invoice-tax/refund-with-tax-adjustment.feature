# Business Context: When a refund is issued, the corresponding tax must also
# be adjusted. Tax authority reports must reflect the net tax collected after
# refunds and adjustments.
# Assumes: Refunds trigger automatic tax recalculation, tax authority reports
# include both original and adjusted amounts, audit trails link refunds to
# original charges.
Feature: Refund with tax adjustment
  Scenario: Refund issued with corresponding tax reduction
    Given a guest was charged $200.00 room rate plus 10% tax of $20.00.
    And the guest has already checked out and paid $220.00.
    When the hotel issues a full refund due to a service complaint.
    Then the room charge of $200.00 is refunded.
    And the tax amount of $20.00 is also refunded.
    And the total refund to the guest is $220.00.
    And the tax authority report is updated to show a $20.00 tax reduction.
    And the refund is linked to the original charge in the audit trail.

  Scenario: Partial refund with proportional tax adjustment
    Given a guest was charged $300.00 for a 2-night stay with 10% tax of $30.00.
    And the hotel agrees to refund one night due to a maintenance issue.
    When a partial refund of $150.00 is issued.
    Then the room charge refund is $150.00.
    And the tax adjustment is $15.00 representing one night's tax.
    And the total refund to the guest is $165.00.
    And the tax authority report reflects the $15.00 net tax reduction.
