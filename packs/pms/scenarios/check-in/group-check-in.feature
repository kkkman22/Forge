# Business Context: A tour group or block of guests arrives together for check-in.
# Group reservations are linked to a master account and may share a group folio.
# Assumes: A group block exists with rooms allocated, a tour escort or group leader
# is present, individual guest identities must still be captured.
Feature: Group check-in
  Scenario: Tour group checks in with pre-assigned rooms
    Given a group block exists with 15 room nights reserved
    And 15 rooms have been pre-assigned to the block
    And a master folio is linked to the group account
    When the tour escort presents the group roster at the front desk
    And the front desk agent verifies the rooming list against the block
    And each guest is assigned to a pre-allocated room
    Then all 15 guests are checked in simultaneously
    And all room statuses change to Occupied
    And room charges are posted to the master folio
    And each guest receives an individual key card

  Scenario: Group member arrives separately from the tour group
    Given a group block exists with 15 room nights reserved
    And 12 group members have already checked in
    When a remaining group member arrives individually
    And presents identification matching the group roster
    Then the guest is checked in under the group reservation
    And the room is assigned from the remaining block allocation
    And charges are routed to the master folio
