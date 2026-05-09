# Business Context: Corporate contracts have a defined validity period. When
# a contract expires, negotiated rates and terms cease, and the account reverts
# to standard pricing. The account manager must be notified in advance.
# Assumes: Contract expiry dates are tracked, notifications are sent before
# expiry, rate codes are deactivated upon expiry, bookings already confirmed
# under the contract may be honored.
Feature: Contract expiry
  Scenario: Corporate contract expires and rates revert to standard
    Given a corporate account Theta Group has a contract expiring on June 30.
    And the contract includes negotiated rates for Standard and Deluxe rooms.
    And a 30-day advance notification policy is configured.
    When the system detects the contract expires in 30 days.
    Then the account manager for Theta Group is notified of the upcoming expiry.
    And the notification includes the current contract terms and rates.
    And the account manager is prompted to initiate renewal discussions.

  Scenario: Expired contract rates deactivated and bookings affected
    Given a corporate account Theta Group contract expired on June 30.
    And a guest attempts to book on July 5 using the Theta Group corporate code.
    When the system validates the corporate rate code.
    Then the corporate rate code is rejected as expired.
    And the guest is offered the Best Available Rate.
    And the booking attempt is logged for the account manager.

  Scenario: Existing reservations honored after contract expiry
    Given a corporate account Theta Group contract expired on June 30.
    And a guest has a confirmed reservation for July 10 made before June 30.
    When the guest checks in on July 10.
    Then the original negotiated rate is honored for the confirmed reservation.
    And the reservation is flagged as a legacy corporate booking.
