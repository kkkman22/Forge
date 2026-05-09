# Business Context: Guest requests to stay past the standard check-out time.
# Hotel applies a late check-out fee based on how far past the deadline the guest
# remains in the room. Different fee tiers may apply (half-day, full-day).
# Assumes: Hotel has a late check-out policy with defined fee tiers,
# the room is not needed for an incoming arrival, the guest is In-House.
Feature: Late check-out with fee
  Scenario: Guest requests late check-out within half-day threshold
    Given a guest is In-House with a standard check-out time of 12:00 PM
    And the late check-out policy charges 50% of the room rate for departure by 6:00 PM
    When the guest requests a late check-out until 4:00 PM
    And the front desk agent approves the request
    Then a late check-out fee of 50% of the room rate is posted to the folio
    And the guest check-out time is extended to 6:00 PM
    And the reservation status remains In-House until the guest departs

  Scenario: Guest stays past check-out time without prior approval
    Given a guest is In-House with a standard check-out time of 12:00 PM
    And the guest has not requested a late check-out
    When the guest is still in the room at 3:00 PM
    Then the system flags the room as a late departure
    And a full-day late check-out fee is posted to the folio
    And housekeeping is notified of the delayed room turnover
