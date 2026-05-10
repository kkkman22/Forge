Feature: Points Forfeit on No-Show
  As a hotel revenue manager
  I want to forfeit loyalty points when a Bonvoy member no-shows
  So that point abuse is prevented

  Scenario: NoShow guest forfeits pending points from the reservation
    Given a guest with Silver Bonvoy membership.
    And the guest has a confirmed reservation with 5000 pending bonus points.
    When the guest is marked as NoShow past the cutoff time.
    Then the 5000 pending bonus points are forfeited.
    And the forfeit is recorded in the guest loyalty history.

  Scenario: Earned points from previous stays are not affected
    Given a guest with Gold Bonvoy membership.
    And the guest has 50000 earned points from prior stays.
    And the guest has a NoShow reservation with 3000 pending points.
    When the NoShow is processed.
    Then only the 3000 pending points are forfeited.
    And the 50000 earned points remain intact.
