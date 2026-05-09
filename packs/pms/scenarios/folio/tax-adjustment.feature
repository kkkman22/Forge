# Business Context: After charges and taxes have been posted to a folio, an
# adjustment may be needed to correct tax amounts (e.g., tax-exempt status,
# incorrect tax rate applied, retroactive tax exemption).
# Assumes: Tax codes are attached to charge categories, adjustments require
# a reason code and authorization, adjusted taxes must be reflected in reports.
Feature: Tax adjustment
  Scenario: Tax exemption applied after charges are posted
    Given a guest is In-House with posted room charges including 10% occupancy tax
    And the guest presents a valid tax exemption certificate
    When the front desk agent applies the tax exemption to the folio
    And selects the appropriate tax exemption reason code
    Then the occupancy tax charges are reversed on the folio
    And a tax adjustment entry is created with the exemption reason
    And the folio balance is reduced by the total tax amount
    And the adjustment is recorded in the tax audit report

  Scenario: Incorrect tax rate corrected on posted charge
    Given a charge of $100.00 was posted with a 12% tax rate
    And the correct tax rate should be 8%
    When the front desk agent corrects the tax rate on the charge
    Then the tax amount is adjusted from $12.00 to $8.00
    And a $4.00 tax credit is posted to the folio
    And the adjustment includes the reason code and agent identity
    And the corrected tax is reflected in the daily tax revenue report
