# Business Context: Guests earn loyalty points for eligible charges during
# their stay. Points are calculated based on the total eligible spend and
# multiplied by the guest's loyalty tier multiplier.
# Assumes: Point earning rules are configured per charge category, tier
# multipliers are defined for each loyalty level, points are posted after
# check-out to prevent abuse.
Feature: Earn points on stay
  Scenario: Guest earns loyalty points based on eligible charges
    Given a Silver loyalty member completes a 3-night stay.
    And the eligible charges total $450.00 for room and dining.
    And the Silver tier earns 10 points per dollar spent.
    When the stay is finalized and points are calculated.
    Then the guest earns 4,500 loyalty points.
    And the points are posted to the guest's loyalty account.
    And the points are pending for 48 hours before becoming available.
    And a points summary is included in the check-out confirmation.

  Scenario: Platinum member earns points with tier multiplier
    Given a Platinum loyalty member completes a 2-night stay.
    And the eligible charges total $600.00.
    And the Platinum tier earns 10 points per dollar with a 1.5x multiplier.
    When the stay is finalized and points are calculated.
    Then the base points are 6,000.
    And the Platinum multiplier adds 3,000 bonus points.
    And the guest earns a total of 9,000 loyalty points.
    And the point breakdown shows base points and tier bonus separately.
