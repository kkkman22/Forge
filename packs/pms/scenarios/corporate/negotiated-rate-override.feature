Feature: Negotiated Rate Override
  As a corporate account manager
  I want to apply negotiated rates that override standard pricing
  So that corporate clients receive their contracted rates

  Scenario: Apply negotiated rate for corporate booking
    Given a corporate account "TechCorp" has a negotiated rate of $129/night
      And the standard rate for a Deluxe room is $199/night
     When a reservation is created for "TechCorp" with a Deluxe room
     Then the system applies the $129/night rate
      And the reservation notes show "Corporate rate: TechCorp negotiated"

  Scenario: Block non-negotiated rate for expired contract
    Given a corporate account "OldCorp" has an expired contract
     When a reservation is created for "OldCorp"
     Then the system rejects the negotiated rate
      And the system applies the standard rate
      And the system sends a notification to the account manager
