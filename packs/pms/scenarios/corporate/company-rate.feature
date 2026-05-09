# Business Context: Corporate clients negotiate special room rates as part of
# a corporate contract. These rates are typically lower than Best Available Rate
# and are tied to a negotiated rate code linked to the corporate account.
# Assumes: A valid corporate contract exists with negotiated rate codes, the rate
# code is linked to specific room types and seasons, the guest's corporate
# affiliation can be verified.
Feature: Company rate booking
  Scenario: Corporate client books at negotiated company rate
    Given a corporate account Acme Corp has an active contract.
    And the contract includes a Corporate Standard rate of $120.00 per night.
    And the rate is valid for Standard King rooms year-round.
    When a guest identifies as an Acme Corp employee during booking.
    And provides the corporate booking code.
    Then the Corporate Standard rate of $120.00 is applied to the reservation.
    And the reservation is linked to the Acme Corp corporate account.
    And the rate is verified against the current contract terms.

  Scenario: Corporate rate rejected for expired contract
    Given a corporate account Beta Inc has a contract that expired on April 30.
    And a guest identifies as a Beta Inc employee on May 15.
    When the guest attempts to book with the corporate rate code.
    Then the corporate rate is rejected as invalid.
    And the guest is offered the Best Available Rate instead.
    And the account manager for Beta Inc is notified of the booking attempt.

  Scenario: Corporate rate applied only for contracted room types
    Given a corporate account Gamma LLC has a rate for Standard King only.
    When a Gamma LLC employee requests a Suite room type.
    Then the corporate rate is not applicable for the Suite room type.
    And the guest is offered the Best Available Rate for the Suite.
