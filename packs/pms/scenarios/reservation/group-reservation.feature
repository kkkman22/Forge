# Business Context: A travel agent or group organizer books a block of rooms
# for a tour group, conference, or corporate event. Group reservations involve
# a block allocation, cutoff date, and may include a master folio arrangement.
# Assumes: The hotel supports group blocks with configurable cutoff dates,
# rooms are allocated from general inventory into the block, a group coordinator
# contact is recorded.
Feature: Group reservation
  Scenario: Travel agent creates a group block
    Given the hotel has sufficient inventory for a block of 20 Deluxe rooms
    And the group requires rooms from June 1 to June 5
    And the negotiated group rate is $120.00 per night per room
    When the travel agent submits a group booking request
    And specifies a cutoff date of May 15 for releasing unclaimed rooms
    And designates a master account for room charges
    Then a group block is created with 20 room nights allocated
    And the block inventory is reserved from general availability
    And a master folio is created for the group account
    And the cutoff date is set to May 15

  Scenario: Individual group members are named after block creation
    Given a group block exists with 20 room nights for June 1 to June 5
    And the cutoff date has not yet passed
    When the travel agent submits a rooming list with 18 guest names
    Then 18 individual reservations are created under the group block
    And each reservation is linked to the master folio
    And 2 rooms remain as unallocated block inventory
    And no additional charges are posted for the named guests
