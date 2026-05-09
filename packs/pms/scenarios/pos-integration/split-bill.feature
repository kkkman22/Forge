# Business Context: A restaurant bill can be split between a room charge and
# a direct payment method. This allows the guest to charge part of the meal to
# the room and pay the remainder in cash or by card at the restaurant.
# Assumes: The POS terminal supports split payment, the PMS accepts partial
# charges from POS, both payment records are maintained for reconciliation.
Feature: Split bill between room charge and cash
  Scenario: Restaurant bill split between room charge and cash payment
    Given a guest is checked into room 505 with an active folio.
    And the guest's restaurant bill is $80.00.
    When the guest requests to charge $50.00 to the room.
    And pays the remaining $30.00 in cash at the restaurant.
    Then $50.00 is posted to the guest's room folio as a Restaurant charge.
    And $30.00 is recorded as a cash payment at the POS terminal.
    And the restaurant bill is marked as fully settled.
    And both payment portions are recorded for daily reconciliation.

  Scenario: Split bill with three-way division
    Given two guests are dining together and one is a hotel guest in room 210.
    And the total bill is $120.00.
    When the guest in room 210 charges $60.00 to the room.
    And the second guest pays $40.00 by credit card.
    And the remaining $20.00 is paid in cash.
    Then $60.00 is posted to room 210's folio.
    And $40.00 is recorded as a card payment at the POS terminal.
    And $20.00 is recorded as a cash payment at the POS terminal.
    And the bill is marked as fully settled with three payment lines.
