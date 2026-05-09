# Business Context: The night audit process may be interrupted due to system errors,
# pending transactions, or manual intervention. The system must support resuming the
# audit from the point of interruption without re-processing completed steps.
# Assumes: Night audit is a multi-step process with identifiable checkpoints,
# partial completion can be safely resumed, data integrity must be maintained.
Feature: Interrupted and resumed night audit
  Scenario: Night audit interrupted and resumed successfully
    Given the night audit process has started for the business day
    And room charges have been posted to all In-House guest folios
    When the night audit is interrupted during the reporting phase
    Then the system records the last completed checkpoint
    And the business day remains in an audit-in-progress state
    And no charges are duplicated

  Scenario: Night audit resumes from the last checkpoint
    Given the night audit was interrupted during the reporting phase
    And room charges and tax postings have already been completed
    When the night audit is resumed
    Then the audit continues from the reporting phase
    And room charges are not re-posted
    And the daily revenue reports are generated
    And the current business day is closed
    And the next business day is opened
    And the system confirms night audit completion
