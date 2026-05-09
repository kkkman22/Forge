# Business Context: A guest needs to change their existing reservation, such as
# adjusting dates, changing room type, or modifying the number of guests.
# Modifications may affect pricing, availability, and deposit requirements.
# Assumes: The reservation exists in a modifiable status (Confirmed, Waitlisted),
# rate rules allow the requested changes, the guest identity is verified.
Feature: Modified reservation
  Scenario: Guest extends the stay by two additional nights
    Given a guest has a confirmed reservation from May 15 to May 18
    And the hotel has availability for May 18 and May 19
    When the guest requests to extend the stay through May 20
    And the rate for the additional nights is available at the same rate code
    Then the reservation dates are updated to May 15 through May 20
    And two additional room nights are charged at the applicable rate
    And the inventory is reduced for the additional nights

  Scenario: Guest upgrades room type before check-in
    Given a guest has a confirmed reservation for a Standard King room
    And a Deluxe Suite is available for the same dates
    When the guest requests an upgrade to a Deluxe Suite
    And the rate difference is $75.00 per night
    Then the room type on the reservation is changed to Deluxe Suite
    And the rate is increased by $75.00 per night
    And the Standard King room is released back to inventory
    And the Deluxe Suite is reserved for the guest
