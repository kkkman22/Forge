# Business Context: Night audit is the end-of-day process that closes the current
# business day, posts room charges, reconciles accounts, and rolls the date forward.
# This is the normal/happy-path scenario.
# Assumes: No pending transactions blocking the audit, all departments have posted
# their charges, the property is configured for automated night audit.
Feature: Normal night audit run
  Scenario: Night audit completes successfully for the business day
    Given the current business day is open with pending room charges
    And all departmental charges have been posted to guest folios
    And no guests are in the process of checking in or out
    When the night audit process is initiated
    Then room charges are posted to all In-House guest folios
    And taxes are calculated and posted for each folio
    And daily revenue reports are generated
    And the current business day is closed
    And the next business day is opened
    And the system confirms night audit completion
