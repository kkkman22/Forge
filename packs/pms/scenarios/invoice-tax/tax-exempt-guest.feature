Feature: Tax Exempt Guest
  As a front desk agent
  I want to handle tax-exempt guests (diplomats, government)
  So that qualifying guests are not charged tax incorrectly

  Scenario: Apply tax exemption for diplomat
    Given a guest presents valid diplomatic tax exemption credentials
     When the front desk applies tax exemption to the reservation
     Then the system removes all tax charges from the folio
      And the folio notes show "Tax exempt: diplomatic credentials verified"

  Scenario: Require re-verification for extended stay
    Given a tax-exempt guest has stayed beyond 30 days
     When the system performs a periodic review
     Then the system flags the reservation for tax exemption re-verification
      And the front desk receives a notification to request updated credentials
