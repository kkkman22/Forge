# Business Context: Guests can charge restaurant meals to their hotel room,
# with the charge appearing on their folio. The POS system communicates with
# the PMS to verify room status and post charges.
# Assumes: The POS terminal is integrated with the PMS, the guest's room is
# in Occupied status, the guest is authorized to charge to the room.
Feature: Charge to room from restaurant
  Scenario: Guest charges restaurant meal to room
    Given a guest is checked into room 312 with an active folio.
    And the restaurant POS terminal is online and connected to the PMS.
    When the guest orders a meal totaling $65.00.
    And the waiter posts the charge to room 312.
    Then the charge of $65.00 appears on the guest's folio as a Restaurant charge.
    And the charge includes the timestamp and POS terminal identifier.
    And the folio balance increases by $65.00.

  Scenario: Room charge rejected for checked-out guest
    Given a guest has already checked out of room 312.
    And the room status is Vacant.
    When a restaurant waiter attempts to post a charge to room 312.
    Then the charge is rejected with a message that the room is not occupied.
    And the waiter is prompted to collect payment directly from the guest.
