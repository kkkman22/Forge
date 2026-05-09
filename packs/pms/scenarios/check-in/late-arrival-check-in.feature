# Business Context: Guest arrives after midnight, crossing the business day boundary.
# The system must determine whether this counts as a late arrival on the previous
# business day or an early arrival on the new business day.
# Assumes: Hotel operates on a rolling business day (e.g., 6:00 AM to 5:59 AM),
# night audit may or may not have already run.
Feature: Late arrival check-in
  Scenario: Guest arrives after midnight before night audit
    Given a guest has a confirmed reservation for the current business date
    And the current time is 1:00 AM
    And the night audit has not yet been executed
    When the guest arrives and presents identification
    And the front desk agent checks in the guest
    Then the guest is checked in under the current business date
    And the reservation status changes to In-House
    And the room status changes to Occupied

  Scenario: Guest arrives after midnight and night audit has completed
    Given a guest has a confirmed reservation for the previous business date
    And the current time is 2:00 AM
    And the night audit has already been executed
    When the guest arrives at the front desk
    Then the system flags the reservation as a late arrival
    And the front desk agent extends the reservation to cover the current business date
    And the guest is checked in under the new business date
    And one additional room night is charged to the folio
