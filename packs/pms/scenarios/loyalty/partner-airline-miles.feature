# Business Context: Hotels partner with airlines to allow guests to earn
# airline miles for hotel stays. Partnership rules define the earning rate,
# eligible stays, and posting procedures.
# Assumes: Airline partnerships are configured with earning rules, guests link
# their airline frequent flyer account to their hotel profile, miles are posted
# after check-out following the partner agreement timeline.
Feature: Partner airline miles earning
  Scenario: Guest earns airline miles for hotel stay
    Given a loyalty member has linked their SkyAir frequent flyer account.
    And the hotel has a partnership with SkyAir.
    And the earning rule is 2 miles per dollar on eligible charges.
    When the member completes a stay with $400.00 in eligible charges.
    Then 800 SkyAir miles are calculated for the stay.
    And the miles are queued for posting to the SkyAir frequent flyer account.
    And the miles are posted within the partner agreement timeline of 72 hours.
    And a miles earning summary is included in the check-out confirmation.

  Scenario: Guest chooses between hotel points and airline miles
    Given a loyalty member has both hotel points and SkyAir miles linked.
    And the member has elected to earn airline miles instead of hotel points.
    When the member completes a stay with $300.00 in eligible charges.
    Then the member earns SkyAir miles instead of hotel loyalty points.
    And the miles are calculated at the partner earning rate.
    And no hotel loyalty points are posted for the stay.
    And the member can switch earning preference before the next stay.
