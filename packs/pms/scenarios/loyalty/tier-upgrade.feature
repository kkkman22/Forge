# Business Context: Loyalty members progress through tiers by accumulating
# qualifying nights. When a member reaches the threshold for the next tier,
# benefits are activated immediately and apply to the current stay.
# Assumes: Tier thresholds are defined by qualifying nights per calendar year,
# benefits vary by tier level, upgrades take effect immediately upon qualification.
Feature: Tier upgrade
  Scenario: Guest accumulates enough nights for tier upgrade
    Given a Silver loyalty member has completed 49 qualifying nights this year.
    And the Gold tier requires 50 qualifying nights.
    And the member checks out after a 2-night stay.
    When the qualifying night count reaches 51.
    Then the member is upgraded to Gold tier.
    And Gold benefits are activated immediately.
    And the member receives a tier upgrade notification.
    And the upgraded benefits apply to any future bookings including the current stay.

  Scenario: Tier upgrade unlocks additional benefits
    Given a member has just been upgraded to Platinum tier.
    And Platinum benefits include late check-out, room upgrades, and lounge access.
    When the member makes a new reservation.
    Then the reservation automatically includes Platinum benefits.
    And a complimentary room upgrade is applied if available.
    And late check-out of 4:00 PM is guaranteed.
    And lounge access is noted on the reservation.
