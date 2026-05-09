# Business Context: Guest presents a credit card at check-in but the authorization
# is declined. The front desk must handle the payment failure while maintaining
# guest experience and policy compliance.
# Assumes: Hotel requires a valid payment method at check-in, pre-authorization
# is attempted for room charges plus an incidentals hold.
Feature: Payment failure during check-in
  Scenario: Credit card declined at check-in
    Given a guest has a confirmed reservation
    And the hotel requires a valid payment method at check-in
    When the front desk agent swipes the guest's credit card
    And the pre-authorization request is declined
    Then the system notifies the front desk agent of the payment failure
    And the check-in process is paused
    And the guest is asked to provide an alternative payment method

  Scenario: Guest provides backup payment method after decline
    Given a guest's primary credit card was declined during check-in
    When the guest provides a second credit card
    And the pre-authorization on the second card is approved
    Then the check-in process resumes
    And the second credit card is recorded as the primary payment method
    And the guest is checked in successfully
    And the folio is opened with the approved payment guarantee
