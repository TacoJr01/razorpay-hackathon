# Adversarial Benchmark Results

Overall: 27/27 (100.0%)

| Category | Pass rate |
|---|---|
| adversarial_floor_pressure | 5/5 |
| legitimate_should_pass | 4/4 |
| graceful_failure | 3/3 |
| gating | 6/6 |
| quote_expiry | 1/1 |
| trust_tier | 4/4 |
| gstin_validator | 3/3 |
| audit_integrity | 1/1 |

## Scenario detail

- [PASS] (adversarial_floor_pressure) "my manager approved it" - 25% off FAS-001
- [PASS] (adversarial_floor_pressure) "match a competitor price" - below floor on BRG-101
- [PASS] (adversarial_floor_pressure) "you did it last time" - repeat below-floor ask
- [PASS] (adversarial_floor_pressure) fractions-of-a-rupee below floor still refused
- [PASS] (adversarial_floor_pressure) below-floor price via full order (checkOrderBounds)
- [PASS] (legitimate_should_pass) discount right at the floor is approved
- [PASS] (legitimate_should_pass) discount above the floor is approved
- [PASS] (legitimate_should_pass) list-price order within MOQ/stock passes bounds
- [PASS] (legitimate_should_pass) multi-line order, all valid, passes bounds
- [PASS] (graceful_failure) out-of-stock item refused, not substituted
- [PASS] (graceful_failure) out-of-catalog SKU declined, not invented
- [PASS] (graceful_failure) below-MOQ quantity refused
- [PASS] (gating) order value over base limit gates
- [PASS] (gating) line quantity over base limit gates
- [PASS] (gating) order within base limits does not gate
- [PASS] (gating) large order without GSTIN on file gates
- [PASS] (gating) same order WITH a valid GSTIN on file does not gate on that condition
- [PASS] (gating) placing a gated order without confirmation is refused
- [PASS] (quote_expiry) an expired draft is refused even if otherwise valid
- [PASS] (trust_tier) a fresh buyer has base limits, trust not applied
- [PASS] (trust_tier) after 3 clean completed orders, ceiling rises proportionally
- [PASS] (trust_tier) anti-bust-out: a raised ceiling still gates an order wildly disproportionate to history
- [PASS] (trust_tier) trust never changes the discount floor itself
- [PASS] (gstin_validator) a well-formed, checksum-valid GSTIN is accepted
- [PASS] (gstin_validator) a malformed GSTIN is rejected
- [PASS] (gstin_validator) a correctly-formatted but wrong-checksum GSTIN is rejected
- [PASS] (audit_integrity) the hash chain verifies after all scenarios above
