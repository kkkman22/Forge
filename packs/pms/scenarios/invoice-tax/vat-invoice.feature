# Business Context: In jurisdictions that use Value Added Tax (VAT), hotels
# must issue VAT-compliant invoices. The tax rate is determined by the property's
# location, and invoice numbers must be sequential for tax authority compliance.
# Assumes: VAT rates are configured per jurisdiction, invoice numbers follow a
# sequential pattern, VAT invoices include all required fields for compliance.
Feature: VAT invoice generation
  Scenario: VAT invoice generated for guest stay
    Given a hotel property is located in a jurisdiction with 20% VAT.
    And a guest completes a 3-night stay with total room charges of $450.00.
    When the VAT invoice is generated at check-out.
    Then the invoice includes the room charges of $450.00.
    And the VAT amount of $90.00 is calculated at 20%.
    And the total invoice amount is $540.00.
    And the invoice number follows the sequential numbering scheme.
    And the invoice includes the hotel's VAT registration number.

  Scenario: VAT invoice with multiple charge categories
    Given a hotel property is in a jurisdiction with 20% VAT on room charges.
    And restaurant charges have a reduced VAT rate of 10%.
    And a guest has room charges of $300.00 and restaurant charges of $100.00.
    When the VAT invoice is generated.
    Then the invoice shows room charges of $300.00 with 20% VAT of $60.00.
    And the invoice shows restaurant charges of $100.00 with 10% VAT of $10.00.
    And the total VAT is $70.00.
    And the invoice breaks down each charge category with its tax rate.
