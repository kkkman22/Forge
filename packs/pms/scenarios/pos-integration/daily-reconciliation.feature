Feature: POS Daily Reconciliation
  As a night auditor
  I want to reconcile POS charges with the PMS folio
  So that all charges are correctly posted before night audit closes

  Scenario: Successful daily reconciliation
    Given the restaurant POS has posted 15 charges today
      And all 15 charges have matching room folio entries
     When the night auditor runs daily reconciliation
     Then the system confirms all charges match
      And the reconciliation report shows "15/15 matched"

  Scenario: Unmatched charge flagged for review
    Given the restaurant POS has posted 15 charges today
      And 1 charge has no matching room folio entry
     When the night auditor runs daily reconciliation
     Then the system flags 1 unmatched charge
      And the reconciliation report shows "14/15 matched, 1 exception"
      And the exception is queued for manual review
