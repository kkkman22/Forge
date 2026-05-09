# Business Context: Loyalty members may access special rates based on their
# tier level. These rates are exclusive to loyalty members and are verified
# against the member's current tier at the time of booking.
# Assumes: Loyalty rates are configured per tier and room category, rate
# availability is checked against the member's tier, the rate is applied
# automatically when the member is authenticated.
Feature: Loyalty rate booking
  Scenario: Loyalty member books at special member rate
    Given a Gold loyalty member is searching for available rates.
    And a Gold Exclusive rate of $130.00 is configured for Standard King.
    And the Best Available Rate for Standard King is $160.00.
    When the member selects the Gold Exclusive rate for booking.
    Then the rate of $130.00 is applied to the reservation.
    And the reservation is linked to the member's loyalty account.
    And the member earns points on the $130.00 room charges.
    And the savings of $30.00 per night are shown on the booking confirmation.

  Scenario: Loyalty rate not available for lower-tier member
    Given a Silver loyalty member attempts to book a Platinum Exclusive rate.
    And the Platinum Exclusive rate is restricted to Platinum and Diamond tiers.
    When the member selects the Platinum Exclusive rate.
    Then the rate is rejected with a tier requirement message.
    And the member is shown rates available for the Silver tier.
    And the member's current tier and the required tier are displayed.
