# Business Context: Walk-in guest arrives without prior reservation.
# Assumes: Rooms available in inventory, front desk staffed, valid identification provided.
Feature: Walk-in check-in
  Scenario: Walk-in guest checks in with available room
    Given a guest arrives at the hotel without a reservation
    And at least one room is available for tonight
    When the front desk agent creates a walk-in reservation
    And assigns an available room to the guest
    And issues a key card
    Then the guest is checked in
    And the room status changes to Occupied
    And a folio is opened for the guest
