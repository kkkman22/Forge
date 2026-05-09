# Business Context: Loyalty members can redeem accumulated points for a free
# night stay. The point cost varies by room category and property tier. Points
# are deducted from the member's balance upon redemption.
# Assumes: Redemption tiers are configured per room category, point balances
# are tracked in real-time, reservations created through redemption follow
# standard check-in procedures.
Feature: Redeem points for free night
  Scenario: Guest redeems points for a free night at standard property
    Given a Gold loyalty member has a point balance of 30,000 points.
    And a standard property requires 20,000 points for a free Standard King night.
    When the member redeems points for a one-night stay.
    Then 20,000 points are deducted from the member's balance.
    And the remaining balance is 10,000 points.
    And a confirmed reservation is created for the requested date.
    And the reservation is marked as a Points Redemption booking.
    And no room charge appears on the guest folio for the redeemed night.

  Scenario: Redemption rejected for insufficient points
    Given a Silver loyalty member has a point balance of 10,000 points.
    And a premium property requires 35,000 points for a Suite night.
    When the member attempts to redeem points for the Suite night.
    Then the redemption is rejected with an insufficient points message.
    And the member's point balance remains unchanged.
    And the member is shown the points needed and current shortfall.

  Scenario: Points redemption includes taxes and fees
    Given a member redeems 20,000 points for a free night.
    And the free night redemption includes applicable taxes.
    When the redemption reservation is created.
    Then no room charge or tax charge appears on the guest folio.
    And the points cover both the room rate and applicable taxes.
