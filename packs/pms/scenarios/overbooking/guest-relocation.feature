Feature: Guest Relocation to Partner Hotel
  As a front desk manager
  I want to relocate overbooked guests to a partner hotel
  So that guest satisfaction is maintained during peak periods

  Scenario: Relocate guest to partner hotel with shuttle
    Given the hotel is overbooked by 2 rooms
      And a partner hotel "Grand Plaza" has availability
     When the front desk relocates a guest to "Grand Plaza"
     Then the system creates a relocation record
      And the system books a shuttle service
      And the guest's reservation status becomes "Relocated"

  Scenario: Relocation costs charged to original property
    Given a guest has been relocated to a partner hotel
      And the partner hotel rate is higher than the original booking
     When the system reconciles the folio
     Then the rate difference is charged to the original property's overbooking fund
      And the guest folio shows no additional charges
