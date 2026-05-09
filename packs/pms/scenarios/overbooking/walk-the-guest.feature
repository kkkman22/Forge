# Business Context: When no room is available and the guest cannot be upgraded,
# the hotel must walk the guest to a partner hotel. This involves arranging
# transportation, securing accommodation at the partner property, and providing
# compensation as per hotel policy.
# Assumes: Partner hotel agreements are in place, transportation can be arranged,
# compensation policy defines amounts by guest tier and circumstances.
Feature: Walk the guest to partner hotel
  Scenario: Overbooked guest walked to partner hotel with full compensation
    Given a confirmed guest arrives for check-in.
    And no rooms are available in any category.
    And a partner hotel has availability for the same dates.
    And the guest is a Gold loyalty member.
    When the front desk agent initiates the walk procedure.
    And contacts the partner hotel to secure a room.
    And arranges transportation to the partner hotel.
    Then the guest reservation is transferred to the partner hotel.
    And the first night is comped at the partner hotel.
    And transportation is arranged and confirmed.
    And the guest receives a compensation voucher for a future stay.
    And the walk incident is recorded on the guest profile.

  Scenario: Walk compensation calculated based on guest loyalty tier
    Given an overbooked Platinum guest is walked to a partner hotel.
    And the Platinum compensation policy provides two nights free and an upgrade.
    When the walk compensation is applied.
    Then the guest receives two complimentary night certificates.
    And the guest is guaranteed a suite upgrade on the next stay.
    And the compensation is recorded against the overbooking incident.
