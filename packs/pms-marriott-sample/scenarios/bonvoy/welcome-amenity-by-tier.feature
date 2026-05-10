Feature: Welcome Amenity by Tier
  As a Bonvoy member
  I want to receive a welcome amenity matching my membership tier
  So that my loyalty status is recognized during my stay

  Scenario: Platinum member receives premium amenity
    Given a guest with Platinum Bonvoy membership.
    And the guest is checking into a room.
    When the front desk agent processes the check-in.
    Then a premium welcome amenity (wine, fruit basket, chocolate) is dispatched to the room.

  Scenario: Titanium member receives enhanced amenity
    Given a guest with Titanium Bonvoy membership.
    And the guest is checking into a suite.
    When the front desk agent processes the check-in.
    Then an enhanced welcome amenity (champagne, gourmet platter, personalized card) is dispatched.

  Scenario: Silver member receives standard amenity
    Given a guest with Silver Bonvoy membership.
    And the guest is checking into a room.
    When the front desk agent processes the check-in.
    Then a standard welcome amenity (bottled water, snack) is dispatched.
