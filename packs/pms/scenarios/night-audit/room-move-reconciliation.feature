# Business Context: Guests may be moved between rooms during their stay (room moves).
# Night audit must reconcile these moves to ensure charges are posted to the correct
# room and folio, and room status accurately reflects the current state.
# Assumes: Room moves can occur due to maintenance, guest complaints, or upgrades.
# Each room move creates a split stay with charges allocated per room per night.
Feature: Room move reconciliation during night audit
  Scenario: Night audit reconciles a guest room move
    Given a guest was moved from room 301 to room 502 during the business day
    And the guest stayed in room 301 for 2 nights before the move
    And the room move was authorized and recorded in the system
    When the night audit processes room charges for the current business day
    Then the room charge is posted for room 502 at the applicable rate
    And room 301 status is updated to Dirty
    And room 502 status remains Occupied
    And the folio reflects charges for both rooms across the respective stay dates

  Scenario: Night audit detects an unrecorded room move
    Given a guest's assigned room is 301
    And housekeeping reports the guest is occupying room 502
    And no room move has been recorded in the system
    When the night audit detects the discrepancy between assigned and actual room
    Then a reconciliation alert is generated for the front desk
    And the room charge is posted to the folio based on the recorded room assignment
    And the front desk must resolve the discrepancy on the next business day
