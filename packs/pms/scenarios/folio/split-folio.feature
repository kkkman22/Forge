# Business Context: A guest's charges need to be split between two parties,
# typically the company paying for room charges and the guest paying for incidentals.
# Split folio allows routing rules to direct charges to separate folios.
# Assumes: The reservation supports multiple folios, routing instructions can be
# configured by charge category, both folios have valid payment methods.
Feature: Split folio
  Scenario: Charges split between company folio and guest folio
    Given a guest is In-House with a corporate reservation
    And the company authorizes payment for room charges only
    And the guest is responsible for all incidental charges
    When the front desk agent configures routing instructions
    And directs Accommodation charges to the company folio
    And directs all other charges to the guest folio
    Then room charges are posted to the company folio
    And incidental charges are posted to the guest folio
    And each folio has an independent balance and payment method

  Scenario: Company folio is settled at check-out while guest folio remains open
    Given a guest has a split folio arrangement with room charges on the company folio
    And incidental charges on the guest folio
    When the guest checks out
    And the company folio is settled via corporate direct billing
    And the guest folio is settled via the guest's credit card
    Then the company folio balance is zero
    And the guest folio balance is zero
    And separate invoices are generated for each folio
