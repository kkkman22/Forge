# Business Context: In the United States, hotels apply sales tax to room charges.
# Tax rates vary by state, county, and city. Some guests qualify for tax-exempt
# status and must be excluded from tax charges.
# Assumes: Tax rates are configured per property location, tax-exempt guests
# provide valid exemption documentation, tax amounts are reported to authorities.
Feature: US sales tax on room charges
  Scenario: US sales tax applied based on property location
    Given a hotel property is located in New York City.
    And the combined state and city occupancy tax rate is 14.75%.
    And a guest has room charges of $200.00 per night for 2 nights.
    When the invoice is generated.
    Then the total room charges are $400.00.
    And the occupancy tax is calculated at 14.75% totaling $59.00.
    And the total amount due is $459.00.
    And the tax breakdown shows state and city portions separately.

  Scenario: Tax-exempt guest excluded from sales tax
    Given a hotel property is located in a jurisdiction with 12% occupancy tax.
    And a guest presents a valid government tax-exempt certificate.
    When the front desk agent applies the tax exemption to the folio.
    Then no occupancy tax is charged on the room charges.
    And the tax-exempt certificate number is recorded on the folio.
    And the guest folio shows zero tax with the exemption reason.
    And the exemption is reflected in the property tax report.
