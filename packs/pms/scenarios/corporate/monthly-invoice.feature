# Business Context: Corporate accounts with direct billing receive a monthly
# invoice aggregating all charges from guest folios during the billing period.
# The invoice is generated automatically at the end of each billing cycle.
# Assumes: The corporate account has direct billing enabled, the billing cycle
# is configured as monthly, all charge postings have been finalized before invoice
# generation.
Feature: Monthly invoice for corporate account
  Scenario: Monthly invoice generated for corporate account
    Given a corporate account Epsilon Ltd has direct billing enabled.
    And the billing cycle ends on the last day of each month.
    And multiple guests from Epsilon Ltd stayed during May.
    And the total charges for May amount to $12,500.00.
    When the monthly invoice is generated for May.
    Then a single invoice is created for Epsilon Ltd for $12,500.00.
    And the invoice lists all guest stays with dates and charge details.
    And each charge is linked to the corresponding guest folio.
    And the invoice is sent to the Epsilon Ltd billing contact.

  Scenario: Monthly invoice shows zero charges when no corporate stays occurred
    Given a corporate account Zeta Inc has direct billing enabled.
    And no guests from Zeta Inc stayed during June.
    When the monthly invoice is generated for June.
    Then a zero-charge invoice is generated as a statement of account.
    And the invoice confirms no activity for the billing period.
