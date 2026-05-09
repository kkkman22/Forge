# Business Context: When an overbooking occurs, the hotel can resolve it by
# upgrading the guest to a higher room category at no additional charge. This
# frees the original room type for the overbooked guest.
# Assumes: Higher-category rooms are available, the upgrade is complimentary,
# the guest is informed of the upgrade at check-in.
Feature: Upgrade to resolve overbooking
  Scenario: Overbooked guest receives complimentary upgrade to suite
    Given the hotel is overbooked on Standard King rooms for June 5.
    And a Standard King room is not available.
    And a Deluxe Suite is available for June 5.
    And the Deluxe Suite rack rate is higher than the Standard King rate.
    When the front desk agent checks in the overbooked guest.
    And assigns the Deluxe Suite at no additional charge.
    Then the guest is checked into the Deluxe Suite.
    And the guest is charged the Standard King rate.
    And the Standard King room type inventory is no longer overbooked.
    And a complimentary upgrade notation is added to the guest profile.

  Scenario: Upgrade not possible when no higher room category is available
    Given the hotel is overbooked on Standard King rooms for June 5.
    And no higher room category has available inventory.
    When the front desk agent attempts to resolve the overbooking.
    Then the walk procedure must be initiated instead.
    And the system flags the overbooking as unresolvable by upgrade.
