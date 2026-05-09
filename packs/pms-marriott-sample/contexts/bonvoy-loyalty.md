# Bonvoy Loyalty

## Responsibility

Manage the Marriott Bonvoy loyalty program integration within the PMS, including tier management, points earning/redemption, and loyalty rate eligibility.

## Aggregates

- LoyaltyAccount
- TierProgress
- PointsTransaction

## Inbound Events

- GuestCheckedIn
- FolioClosed
- StayCompleted

## Outbound Events

- PointsEarned
- PointsRedeemed
- TierUpgraded
- LoyaltyRateApplied

## Upstream Contexts

- reservations (guest stays trigger points)
- folio-billing (eligible charges determine points)

## Downstream Contexts

- (none — loyalty is a consumer context)
