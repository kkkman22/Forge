# Business Context: Overbooking compensation amounts vary based on the hotel's
# compensation policy tiers and the guest's loyalty tier. Higher-tier guests
# receive more generous compensation to maintain brand loyalty.
# Assumes: Compensation tiers are configured per property, loyalty tiers are
# defined in the guest profile, compensation is tracked for financial reporting.
Feature: Compensation policy for overbooking
  Scenario: Standard guest receives base compensation for overbooking
    Given a standard guest with no loyalty membership is overbooked.
    And the base compensation policy provides one night free.
    When the compensation is calculated.
    Then the guest receives a voucher for one free night at the same property.
    And the compensation value equals one night at the Best Available Rate.
    And the compensation is recorded in the overbooking incident report.

  Scenario: Gold loyalty guest receives enhanced compensation
    Given a Gold loyalty member is overbooked.
    And the Gold compensation policy provides one night free and a dining credit.
    When the compensation is calculated.
    Then the guest receives a voucher for one free night.
    And the guest receives a dining credit of $50.
    And the total compensation is recorded against the loyalty program budget.

  Scenario: Platinum loyalty guest receives premium compensation
    Given a Platinum loyalty member is overbooked.
    And the Platinum compensation policy provides two nights free and a suite upgrade.
    When the compensation is calculated.
    Then the guest receives vouchers for two free nights at any property.
    And the guest receives a guaranteed suite upgrade on the next booking.
    And the compensation value is calculated at the suite rack rate.
    And the total compensation is recorded against the loyalty program budget.
