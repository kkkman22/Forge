# Business Context: A deposit was collected at the time of booking. When the
# reservation is cancelled within the allowed policy window, the deposit must
# be refunded. Refund processing may involve timing rules and payment method
# constraints.
# Assumes: Deposit was collected via credit card or direct payment, refund
# policy allows full or partial refund based on cancellation timing, refunds
# are tracked for financial reconciliation.
Feature: Deposit refund on cancellation
  Scenario: Full deposit refunded on timely cancellation
    Given a guest made a reservation with a deposit of $200.00
    And the deposit was paid by credit card
    And the guest cancels the reservation within the free cancellation window
    When the system processes the cancellation
    Then a refund of $200.00 is initiated to the original credit card
    And the refund transaction is recorded on the folio
    And the deposit line item on the folio shows a refund status
    And the guest receives a refund confirmation

  Scenario: Partial deposit refunded based on cancellation policy
    Given a guest made a reservation with a deposit of $200.00
    And the cancellation policy allows a 50% refund if cancelled within 48 hours of arrival
    And the guest cancels the reservation 36 hours before arrival
    When the system processes the cancellation
    Then a refund of $100.00 is initiated to the original payment method
    And $100.00 is retained as a cancellation fee
    And the folio reflects the partial refund and the retained amount
    And a cancellation fee line item is posted to the folio
