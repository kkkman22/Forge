# Business Context: A guest cancels a reservation within the allowed cancellation
# window. The cancellation policy defines the deadline and any applicable fees.
# Cancellations within policy are free of penalty; those outside may incur charges.
# Assumes: Cancellation policies are attached to the rate code, the reservation
# is in a cancellable status, refunds follow the original payment method.
Feature: Cancellation within policy
  Scenario: Guest cancels before the cancellation deadline
    Given a guest has a confirmed reservation for May 20 to May 23
    And the cancellation policy allows free cancellation until 6:00 PM on May 19
    And a deposit of one night room rate has been collected
    When the guest cancels the reservation on May 17
    Then the reservation status changes to Cancelled
    And the deposit is refunded in full
    And the room is released back to available inventory
    And a cancellation confirmation is sent to the guest

  Scenario: Guest cancels exactly at the cancellation deadline
    Given a guest has a confirmed reservation for May 20 to May 23
    And the cancellation policy allows free cancellation until 6:00 PM on May 19
    When the guest cancels the reservation at 5:59 PM on May 19
    Then the reservation status changes to Cancelled
    And no cancellation fee is charged
    And the room is released back to available inventory
