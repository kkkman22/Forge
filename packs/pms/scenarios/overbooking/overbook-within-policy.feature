# Business Context: Hotels may intentionally overbook room types based on
# historical no-show data and occupancy forecasts. The overbooking policy defines
# a threshold percentage of rooms that can be oversold.
# Assumes: Overbooking policy is configured per room type, inventory tracking
# allows negative availability within policy limits, overbooked nights are recorded
# for analysis.
Feature: Overbook within policy
  Scenario: Hotel overbooks a room type when occupancy is below policy threshold
    Given the hotel has 100 Standard Double rooms in inventory.
    And 95 Standard Double rooms are sold for June 1.
    And the overbooking policy allows up to 3% oversell for Standard Double.
    When a guest requests a Standard Double room for June 1.
    Then the reservation is accepted even though physical inventory is exceeded.
    And the overbooking is recorded with the date, room type, and reason.
    And the overbooking count for Standard Double on June 1 is 1.

  Scenario: Overbooking blocked when policy threshold is reached
    Given the hotel has 100 Standard Double rooms in inventory.
    And 103 Standard Double rooms are sold for June 1.
    And the overbooking policy allows up to 3% oversell for Standard Double.
    When a guest requests a Standard Double room for June 1.
    Then the reservation is rejected with a sold-out status.
    And the guest is offered an alternative room type or date.
    And the rejected overbooking attempt is logged for analysis.
