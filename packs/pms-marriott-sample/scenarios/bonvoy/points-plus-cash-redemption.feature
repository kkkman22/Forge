Feature: Points Plus Cash Redemption
  As a Bonvoy member
  I want to redeem a free night using points combined with cash
  So that I can use partial points when I do not have enough for a full award stay

  Scenario: Redeem free night with 50 percent points and 50 percent cash
    Given a guest with Gold Bonvoy membership.
    And the guest has 15000 points available.
    And a standard room costs 30000 points for one free night.
    When the guest selects points-plus-cash redemption.
    Then 15000 points are deducted from the guest account.
    And the remaining value is charged as 750 CNY to the guest credit card.
    And the reservation is confirmed as an award stay.

  Scenario: Cannot redeem when points fall below minimum threshold
    Given a guest with Silver Bonvoy membership.
    And the guest has 2000 points available.
    And the minimum points-plus-cash threshold is 5000 points.
    When the guest attempts points-plus-cash redemption.
    Then the redemption is rejected.
    And the guest is notified that minimum 5000 points are required.
