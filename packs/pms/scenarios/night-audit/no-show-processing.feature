# Business Context: During night audit, the system identifies confirmed reservations
# where the guest did not arrive (NoShow). These reservations must be processed
# according to the hotel's NoShow and cancellation policies.
# Assumes: Hotel has a NoShow policy (e.g., charge one night room rate), reservations
# are in Confirmed status, check-in deadline has passed.
Feature: NoShow processing during night audit
  Scenario: Confirmed reservation is marked as NoShow
    Given a confirmed reservation exists for the current business date
    And the guest has not checked in by the end of the business day
    And the hotel NoShow policy charges one night room rate
    When the night audit runs and identifies the unarrived reservation
    Then the reservation status changes to NoShow
    And a NoShow charge equal to one night room rate is posted to the folio
    And the room is released back to available inventory
    And the NoShow is recorded in the arrival report

  Scenario: Guaranteed reservation is NoShow with deposit applied
    Given a guaranteed reservation exists with a deposit of one night room rate
    And the guest has not checked in by the end of the business day
    When the night audit processes the reservation as NoShow
    Then the reservation status changes to NoShow
    And the deposit is forfeited and applied as the NoShow charge
    And no additional charge is posted beyond the deposit amount
    And the room is released back to available inventory
