# Business Context: Corporate accounts have a credit limit to manage financial
# exposure. When charges exceed the limit, new charges must be blocked until
# payment is received or the limit is increased.
# Assumes: The corporate account has an active direct billing agreement, the
# credit limit is monitored in real-time, the account manager is notified when
# the limit is approached and exceeded.
Feature: Credit limit exceeded
  Scenario: Corporate account exceeds credit limit and new charges blocked
    Given a corporate account Eta Corp has a credit limit of $30,000.00.
    And the current outstanding balance is $28,500.00.
    And a new charge of $2,500.00 is posted for an Eta Corp guest.
    When the charge causes the outstanding balance to exceed the credit limit.
    Then the new charge is blocked from posting to the corporate folio.
    And the front desk agent is alerted that the credit limit is exceeded.
    And the account manager for Eta Corp is notified.
    And the guest is asked to provide an alternative payment method.

  Scenario: Charges resume after payment reduces balance below credit limit
    Given a corporate account Eta Corp has an outstanding balance of $31,000.00.
    And the credit limit is $30,000.00.
    And charges are currently blocked.
    When Eta Corp makes a payment of $10,000.00.
    Then the outstanding balance is reduced to $21,000.00.
    And charges are unblocked for direct billing.
    And the account manager is notified that the account is in good standing.
