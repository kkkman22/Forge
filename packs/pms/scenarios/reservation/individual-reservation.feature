# Business Context: A single guest makes a reservation for a future stay.
# This is the most common reservation type, covering date selection, room type
# choice, rate negotiation, and guarantee method.
# Assumes: The hotel has inventory available for the requested dates, rate codes
# are configured for the requested room type, the guest provides valid contact details.
Feature: Individual reservation
  Scenario: Guest creates a guaranteed reservation with credit card
    Given the hotel has a Standard King room available from May 15 to May 18
    And the Best Available Rate is $150.00 per night
    When the guest requests a reservation for 3 nights
    And provides a valid credit card as guarantee
    Then a confirmed reservation is created for the guest
    And the room inventory is reduced by one for each night of the stay
    And a confirmation number is generated
    And a confirmation is sent to the guest's email address

  Scenario: Guest creates a non-guaranteed reservation
    Given the hotel has a Standard King room available from May 15 to May 18
    And the hold release time is 6:00 PM on the arrival date
    When the guest requests a reservation without a payment guarantee
    Then a non-guaranteed reservation is created
    And the room is held until 6:00 PM on the arrival date
    And the reservation is subject to automatic release if the guest does not arrive by the hold time
    And no deposit is charged at the time of booking
