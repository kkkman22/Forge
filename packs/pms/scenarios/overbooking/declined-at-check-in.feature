# Business Context: An overbooked guest arrives at the hotel expecting a room
# but no room is available. The front desk must handle the situation gracefully,
# initiating the walk procedure and applying appropriate compensation.
# Assumes: The guest has a confirmed and guaranteed reservation, the hotel has
# exhausted all upgrade options, the walk procedure is the last resort.
Feature: Declined at check-in due to overbooking
  Scenario: Overbooked guest arrives and walk procedure is initiated
    Given a guest has a confirmed guaranteed reservation for June 10.
    And the hotel has no rooms available in any category on June 10.
    And the guest arrives at the front desk expecting to check in.
    When the front desk agent informs the guest of the overbooking.
    And initiates the walk procedure.
    Then the guest is offered accommodation at a comparable partner hotel.
    And the guest receives one night free at the partner hotel.
    And round-trip transportation is provided.
    And the guest profile is flagged with the overbooking incident.
    And the hotel pays the partner hotel for the guest's accommodation.

  Scenario: Guest declines walk and requests compensation instead
    Given an overbooked guest is offered a walk to a partner hotel.
    When the guest declines the walk arrangement.
    Then the hotel provides a full refund of any prepaid charges.
    And the hotel assists the guest in finding alternative accommodation.
    And a goodwill compensation is applied to the guest's loyalty account.
    And the incident is documented for management review.
