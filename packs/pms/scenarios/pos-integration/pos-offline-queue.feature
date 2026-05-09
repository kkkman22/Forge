# Business Context: POS terminals may lose connectivity to the PMS temporarily.
# During offline periods, charges are queued locally on the terminal and
# synchronized automatically when the connection is restored.
# Assumes: POS terminals have local storage for offline charges, each charge
# has a unique identifier to prevent duplication, synchronization preserves
# the original transaction timestamp.
Feature: POS offline queue
  Scenario: POS terminal goes offline and charges are queued
    Given a POS terminal at the lobby bar is connected to the PMS.
    And the guest in room 401 charges a $25.00 drink to the room.
    When the network connection between the POS terminal and PMS is lost.
    And another guest in room 402 charges a $30.00 meal to the room.
    Then the $30.00 charge is stored in the local queue on the POS terminal.
    And the charge is marked with a pending synchronization status.
    And the POS terminal continues to operate normally for new charges.

  Scenario: Queued charges synchronized when connection is restored
    Given a POS terminal has 3 charges queued locally during an offline period.
    And the charges are for rooms 401, 402, and 403.
    When the network connection to the PMS is restored.
    Then all 3 queued charges are posted to the respective room folios.
    And each charge retains its original transaction timestamp.
    And no duplicate charges are created during synchronization.
    And the local queue is cleared after successful synchronization.
    And the PMS reconciliation report shows the synchronized charges.
