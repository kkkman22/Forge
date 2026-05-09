# Business Context: Guest disputes one or more charges on the folio at check-out.
# The front desk must review the charges, adjust or remove them as appropriate,
# and settle the remaining balance.
# Assumes: Charges have been posted to the folio during the stay, the guest
# is at the front desk for check-out, staff have authority to adjust charges
# within policy limits.
Feature: Disputed charges at check-out
  Scenario: Guest disputes a posted charge and adjustment is approved
    Given a guest is In-House and ready to check out
    And the folio contains a minibar charge of $45.00
    When the guest disputes the minibar charge
    And the front desk agent verifies the guest did not consume the minibar items
    And the agent removes the charge with manager approval
    Then the disputed charge is removed from the folio
    And an adjustment reason code is recorded for audit
    And the remaining balance is settled at check-out

  Scenario: Guest disputes a charge that is confirmed valid
    Given a guest is In-House and ready to check out
    And the folio contains a room service charge of $80.00
    When the guest disputes the room service charge
    And the front desk agent verifies the charge with the room service delivery log
    And the delivery log confirms the order was delivered to the guest's room
    Then the charge remains on the folio
    And the guest is informed of the verification result
    And the full balance is settled at check-out
