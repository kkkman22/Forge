# Hotel PMS Domain Pack

酒店前台管理系统（Property Management System）领域知识包，为 Forge 提供开箱即用的 PMS 限界上下文、统一语言和状态机定义。

## 8 Bounded Contexts

| Context | Responsibility | Type |
|---------|---------------|------|
| `reservations` | 预订全生命周期管理 | Core |
| `front-desk` | 前台接待与入住/退房操作 | Supporting |
| `housekeeping` | 客房清洁与维护调度 | Supporting |
| `folio-billing` | 账单与费用管理 | Core |
| `night-audit` | 夜审与日结处理 | Core |
| `rate-inventory` | 房价与库存管理 | Supporting |
| `channel-integration` | OTA/直连渠道对接 | Supporting |
| `reporting` | 运营报表与数据分析 | Generic |

## 4 State Machines

| State Machine | States | File |
|--------------|--------|------|
| Reservation | Booked → Confirmed → CheckedIn → CheckedOut / NoShow / Cancelled | `state-machines/reservation.yaml` |
| Folio | Open → Posted → Closed / Voided | `state-machines/folio.yaml` |
| Room Status | Available / Occupied / Dirty / Clean / Inspected / OutOfService / OutOfOrder | `state-machines/room-status.yaml` |
| Housekeeping Task | Pending → InProgress → Completed / Skipped | `state-machines/housekeeping-task.yaml` |

## Scenario Library

**Total: 50 files / 103 scenarios**

### check-in/ (Sprint 2 — 5 files, 9 scenarios)

| File | Feature |
|------|---------|
| `early-arrival-check-in.feature` | Early arrival check-in |
| `group-check-in.feature` | Group check-in |
| `late-arrival-check-in.feature` | Late arrival check-in |
| `payment-failure-check-in.feature` | Payment failure during check-in |
| `walk-in-check-in.feature` | Walk-in check-in |

### check-out/ (Sprint 2 — 3 files, 6 scenarios)

| File | Feature |
|------|---------|
| `dispute-check-out.feature` | Disputed charges at check-out |
| `express-check-out.feature` | Express check-out |
| `late-check-out-with-fee.feature` | Late check-out with fee |

### reservation/ (Sprint 2 — 4 files, 8 scenarios)

| File | Feature |
|------|---------|
| `cancellation-within-policy.feature` | Cancellation within policy |
| `group-reservation.feature` | Group reservation |
| `individual-reservation.feature` | Individual reservation |
| `modified-reservation.feature` | Modified reservation |

### folio/ (Sprint 2 — 4 files, 8 scenarios)

| File | Feature |
|------|---------|
| `charge-posting.feature` | Charge posting |
| `deposit-refund.feature` | Deposit refund on cancellation |
| `split-folio.feature` | Split folio |
| `tax-adjustment.feature` | Tax adjustment |

### night-audit/ (Sprint 2 — 4 files, 7 scenarios)

| File | Feature |
|------|---------|
| `interrupted-resumed-night-audit.feature` | Interrupted and resumed night audit |
| `no-show-processing.feature` | NoShow processing during night audit |
| `normal-night-audit.feature` | Normal night audit run |
| `room-move-reconciliation.feature` | Room move reconciliation during night audit |

### overbooking/ (Sprint 3 — 6 files, 13 scenarios)

| File | Feature |
|------|---------|
| `compensation-policy.feature` | Compensation policy for overbooking |
| `declined-at-check-in.feature` | Declined at check-in due to overbooking |
| `guest-relocation.feature` | Guest relocation to partner hotel |
| `overbook-within-policy.feature` | Overbook within policy |
| `upgrade-to-resolve.feature` | Upgrade to resolve overbooking |
| `walk-the-guest.feature` | Walk the guest to partner hotel |

### corporate/ (Sprint 3 — 6 files, 14 scenarios)

| File | Feature |
|------|---------|
| `company-rate.feature` | Company rate booking |
| `contract-expiry.feature` | Contract expiry |
| `credit-limit-exceeded.feature` | Credit limit exceeded |
| `direct-bill-setup.feature` | Direct bill setup |
| `monthly-invoice.feature` | Monthly invoice for corporate account |
| `negotiated-rate-override.feature` | Negotiated rate override |

### pos-integration/ (Sprint 3 — 6 files, 13 scenarios)

| File | Feature |
|------|---------|
| `charge-to-room-from-restaurant.feature` | Charge to room from restaurant |
| `chargeback.feature` | Chargeback for POS charge |
| `daily-reconciliation.feature` | POS daily reconciliation |
| `item-void-sync.feature` | Item void synchronization |
| `pos-offline-queue.feature` | POS offline queue |
| `split-bill.feature` | Split bill between room charge and cash |

### invoice-tax/ (Sprint 3 — 6 files, 12 scenarios)

| File | Feature |
|------|---------|
| `refund-with-tax-adjustment.feature` | Refund with tax adjustment |
| `split-tax-multi-jurisdiction.feature` | Split tax across multiple jurisdictions |
| `tax-exempt-guest.feature` | Tax exempt guest handling |
| `us-sales-tax.feature` | US sales tax on room charges |
| `vat-invoice.feature` | VAT invoice generation |
| `void-invoice.feature` | Void invoice |

### loyalty/ (Sprint 3 — 6 files, 13 scenarios)

| File | Feature |
|------|---------|
| `earn-points-on-stay.feature` | Earn points on stay |
| `loyalty-rate.feature` | Loyalty rate booking |
| `partner-airline-miles.feature` | Partner airline miles earning |
| `points-expiration.feature` | Points expiration |
| `redeem-points.feature` | Redeem points for free night |
| `tier-upgrade.feature` | Tier upgrade |

## Setup

```bash
/forge pack enable pms
```

## Customization

通过 `.forge/custom/` 覆盖 pack 内容：
- `.forge/custom/pms/glossary/` — 自定义术语
- `.forge/custom/pms/banned-patterns.yaml` — 自定义禁用词
- `.forge/custom/pms/state-machines/` — 自定义状态机
