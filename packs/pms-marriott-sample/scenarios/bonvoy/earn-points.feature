Feature: Earn Bonvoy Points on Stay
  As a Bonvoy member
  I want to earn loyalty points for my hotel stay
  So that my loyalty is rewarded

  Scenario: Platinum member earns points for eligible stay
    Given a guest with Platinum Bonvoy membership.
    And the guest has an eligible room charge of 1000 CNY.
    When the stay is completed and folio is closed.
    Then the guest earns 20000 points (20x multiplier).
    And the points are posted to the Bonvoy account.

  Scenario: Points earned only on eligible charges
    Given a guest with Gold Bonvoy membership.
    And the folio contains 800 CNY room charge and 200 CNY minibar charge.
    When the stay is completed.
    Then only room charges qualify for points.
    And minibar charges are excluded from points calculation.
