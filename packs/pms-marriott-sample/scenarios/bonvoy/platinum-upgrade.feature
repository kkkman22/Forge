Feature: Platinum Upgrade from Loyalty Status
  As a Platinum Bonvoy member
  I want automatic room upgrade when available
  So that I receive my tier benefit

  Scenario: Platinum member receives upgrade at check-in
    Given a guest with Platinum Bonvoy membership.
    And a standard room reservation exists.
    And a suite is available for the same dates.
    When the guest checks in.
    Then the reservation enters AwaitingLoyaltyUpgrade state.
    And the guest is upgraded to the suite.
    And the original room is released back to inventory.

  Scenario: No upgrade when no higher room available
    Given a guest with Platinum Bonvoy membership.
    And a suite reservation already exists.
    And no higher category rooms exist.
    When the guest checks in.
    Then no upgrade is applied.
    And the guest retains original room assignment.
