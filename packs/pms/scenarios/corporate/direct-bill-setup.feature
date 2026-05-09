# Business Context: Corporate accounts can be configured for direct billing,
# where charges are invoiced to the company rather than collected from the guest
# at check-out. This requires a valid direct billing agreement and credit limit.
# Assumes: The corporate account has an active direct billing agreement, routing
# instructions specify which charge categories are billable to the company, the
# account has an approved credit limit.
Feature: Direct bill setup
  Scenario: Corporate account configured for direct billing
    Given a corporate account Delta Corp has an active contract.
    And Delta Corp has signed a direct billing agreement.
    And a credit limit of $50,000 has been approved.
    When the account manager configures direct billing for Delta Corp.
    And sets room and meal charges as billable categories.
    Then all eligible charges for Delta Corp guests are routed to the corporate folio.
    And the corporate folio accumulates charges up to the approved credit limit.
    And individual guest folios show only non-billable incidental charges.

  Scenario: Direct billing verified during guest check-in
    Given a corporate account with direct billing is configured.
    And a guest arrives with a reservation linked to the corporate account.
    When the front desk agent checks in the guest.
    Then the routing instructions are automatically applied.
    And the guest is informed that room charges will be billed to the company.
    And the guest folio separates billable and non-billable charges.
