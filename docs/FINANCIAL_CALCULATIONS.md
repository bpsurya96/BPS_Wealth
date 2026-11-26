# BPS Wealth — Financial Calculations Specification

All monetary calculations are backed by exact integer minor units (`src/lib/currency.ts`) and tested in `tests/unit/finance.test.ts` and `tests/e2e/workflows.test.ts`.

---

## 1. Monetary Precision & Currency Conversion

- **Minor Units**: `INR` and `USD` use 2 decimal places (`scale = 100`, paise / cents).
- `toMinorUnits(major, currency)` adds `1e-9` before `Math.round` on `abs(major) * scale` (preserving sign) to eliminate IEEE-754 representation artifacts (e.g. `1.005 * 100 -> 101`).
- **Foreign Exchange**:
  - `convertMinorToInrMinor(minorAmount, currency, fxRate)` converts `USD` minor units using `fxRate` (INR per 1 USD).
  - **Historical transactions** retain their transaction-recorded `fxRate` (`investment_transactions.fx_rate`) for historical cashflow XIRR and Monthly SIP Matrix INR totals.
  - **Current portfolio valuations** convert active holding values using today's `usd_inr_rate` setting.
- **Partial / Full Redemptions (`sell`)**:
  - Remaining invested cost basis is reduced proportionally to units sold:
    $$\text{New Cost Basis} = \text{Old Cost Basis} \times \frac{\text{Units Before} - \text{Units Sold}}{\text{Units Before}}$$
  - Full redemptions (`units <= 1e-6`) reduce cost basis to `0` and set holding `status = 'closed'`.
- **Non-Purchase Events**:
  - `dividend` and `interest_payout` do **not** alter `investedAmount` or `units`.
  - `interest` (compounded accrual, e.g. PPF/FD) increases `currentValue` without inflating investor contributed cost basis.

---

## 2. XIRR Calculation (`calculateXIRR` in `src/lib/finance.ts`)

- **Definition**: Solves for annualized rate $r$ such that:
  $$\sum_{i=0}^{n} \frac{C_i}{(1 + r)^{(t_i - t_0) / 365.25}} = 0$$
- **Same-Date Aggregation**: Cashflows on the same `YYYY-MM-DD` date are summed prior to solving.
- **Cashflow Signs**:
  - Outflows ($-$): `sip`, `buy`, `installment`, `employer_contribution`.
  - Inflows ($+$): `sell`, `redemption`, `withdrawal`, `dividend`, `interest_payout`, plus terminal valuation on `asOfDate` for active holdings (`status !== 'closed'`).
  - Internal accruals (`interest`): `0` external cashflow (reflected via terminal valuation).
- **Guards**: Returns `null` when fewer than 2 net cashflow dates exist, all cashflows share the same sign, or total duration is $< 1$ day.
- **Solver**: Multi-start Newton-Raphson (`[0.12, 0.0, 0.5, -0.3]`) with bisection fallback across progressive brackets (`[-0.95, 5]`, `[-0.999, 25]`, `[-0.9999, 100]`).

---

## 3. Net Worth vs Investment Portfolio

- **Investment Portfolio Value** (`totalPortfolioInr`): Sum of active (`status !== 'closed'`) holdings converted to INR (`units * currentNav` when both $> 0$, else `currentValue`).
- **Other Financial Assets** (`otherFinancialAssetsInr`): `asset_register` entries with `asset_type` in `{financial_cash, financial_other}` (cash, bank accounts not already in FDs/holdings).
- **Physical Assets** (`physicalAssetsInr`): `asset_register` entries with `asset_type` in `{physical_property, physical_vehicle, physical_other}`.
- **Total Assets**: $\text{Investment Portfolio} + \text{Other Financial Assets} + \text{Physical Assets}$.
- **Total Liabilities**: Sum of `current_balance` for `loans` where `status = 'active'`.
- **Personal Net Worth**: $\text{Total Assets} - \text{Total Liabilities}$.
- **Historical Snapshots**: Track `liabilitiesKnown` (`boolean`). When historical spreadsheets provide only asset milestones, `totalLiabilities` and `netWorth` remain `null` rather than inventing `0`.

---

## 4. Income Aggregation & Rental Deduplication

- Income is strictly separated into four categories: `salary` (Main Income), `rental`, `dividend`, and `other` (Passive Income = `rental + dividend + other`).
- `rental_payments` is the authoritative ledger for rental property receipts (`rentAmount`).
- `income_entries` with `category = 'rental'` and `rental_payment_id IS NOT NULL` are excluded from aggregation so property rent is never double-counted.

---

## 5. Insurance Premium Normalization

- `normalizeAnnualInsurancePremium(premiumAmount, frequency)`:
  - `monthly` $\rightarrow \text{premiumAmount} \times 12$
  - `annual` $\rightarrow \text{premiumAmount}$
- Dashboard totals aggregate annualized premiums across `active` policies.
