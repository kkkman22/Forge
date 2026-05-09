# Business Context: Guest arrives before the standard check-in time (e.g., 10:00 AM for a 3:00 PM check-in).
# Assumes: Hotel has an early arrival policy, rooms may or may not be ready,
# front desk can offer early check-in, paid upgrade, or luggage storage.
Feature: Early arrival check-in
  Scenario: Guest arrives early and room is ready
    Given a guest has a confirmed reservation for today
    And the standard check-in time is 3:00 PM
    And the assigned room has been cleaned and inspected
    When the guest arrives at 10:00 AM
    And the front desk agent grants early check-in
    Then the guest is checked in before standard check-in time
    And the room status changes to Occupied
    And no early arrival fee is charged

  Scenario: Guest arrives early and room is not ready
    Given a guest has a confirmed reservation for today
    And the standard check-in time is 3:00 PM
    And the assigned room is still being cleaned
    When the guest arrives at 10:00 AM
    Then the front desk agent offers luggage storage to the guest
    And the guest receives a notification when the room is ready
    And the guest is checked in once the room status becomes Inspected
