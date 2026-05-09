# Business Context: Charges are posted to a guest's folio during the stay.
# This includes room charges (posted by night audit) and incidental charges
# (posted manually or via interface from POS, minibar, laundry, etc.).
# Assumes: The guest is In-House with an open folio, charge posting follows
# the business date of the property, charges are categorized by revenue code.
Feature: Charge posting
  Scenario: Room charge and incidental are posted to guest folio
    Given a guest is In-House with an open folio
    And the current business date is May 15
    When the night audit posts the daily room charge of $150.00
    And the restaurant posts a breakfast charge of $35.00 via POS interface
    Then the folio balance is increased by $185.00
    And the room charge is recorded under the Accommodation revenue category
    And the breakfast charge is recorded under the Food and Beverage revenue category
    And both charges are dated May 15 on the folio

  Scenario: Manual charge posted by front desk
    Given a guest is In-House with an open folio
    When the front desk agent posts a manual charge of $20.00 for a damaged towel
    And selects the appropriate revenue code for property damage
    Then the charge appears on the folio with a description and revenue code
    And the folio balance is increased by $20.00
    And the posting is recorded in the audit trail with the agent's identity
