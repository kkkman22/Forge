# Business Context: A guest's stay may span a date where tax rates change,
# such as a new fiscal year or a jurisdictional rate adjustment. Different tax
# rates must be applied per night based on the applicable rate on each date.
# Assumes: Tax rate effective dates are configured in the system, each night of
# the stay is evaluated independently, the invoice shows the rate per night.
Feature: Split tax across multiple jurisdictions
  Scenario: Multi-night stay crosses a tax rate change date
    Given a hotel property is in a jurisdiction where the tax rate changes on July 1.
    And the tax rate is 10% from June 28 to June 30.
    And the tax rate increases to 12% from July 1 onward.
    And a guest stays from June 29 to July 2 for 3 nights.
    And the room rate is $150.00 per night.
    When the invoice is generated.
    Then June 29 night is charged $150.00 with 10% tax of $15.00.
    And June 30 night is charged $150.00 with 10% tax of $15.00.
    And July 1 night is charged $150.00 with 12% tax of $18.00.
    And the total tax on the invoice is $48.00.
    And the invoice shows a nightly breakdown with the applicable tax rate.

  Scenario: Stay spans two different tax jurisdictions
    Given a guest stays at a property near a county boundary.
    And the first 2 nights fall under County A with 8% tax.
    And a mid-stay room move places the guest under County B with 11% tax for the remaining nights.
    When the invoice is generated for the 4-night stay.
    Then the first 2 nights are taxed at 8%.
    And the remaining 2 nights are taxed at 11%.
    And the invoice clearly labels each jurisdiction's tax portion.
