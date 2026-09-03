/**
 * Scored adversarial benchmark - "npm run benchmark -w backend". Unlike
 * smoke.ts (a handful of pass/fail assertions), this drives ~20+ scenarios
 * grouped by category, LLM-free and deterministic, and reports a real
 * pass-rate scorecard including a false-positive check (legitimate
 * requests that should NOT be refused) - not just attack recall. Written
 * to close the credibility gap against the strongest Track 1 competitor
 * found during research (agentgate), which publishes recall/FP numbers
 * with confidence intervals; this is the same spirit at a scope that fits
 * the time available.
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import {
  proposeDiscount,
  checkOrderBounds,
  checkOrderGate,
  executePlacement,
} from '../src/agent/actions.js';
import { computeBuyerLimits } from '../src/agent/trust.js';
import { setBuyerGSTIN } from '../src/agent/buyerProfile.js';
import { isValidGSTIN } from '../src/agent/gstin.js';
import { redis } from '../src/redis/client.js';
import { verifyChain } from '../src/audit/auditService.js';
import { sqlite } from '../src/db/client.js';

interface Scenario {
  category: string;
  name: string;
  run: () => Promise<boolean> | boolean;
}

const scenarios: Scenario[] = [];
function scenario(category: string, name: string, run: Scenario['run']) {
  scenarios.push({ category, name, run });
}

// ---------------------------------------------------------------------------
// Category: adversarial floor pressure - below-floor prices must always be
// refused, no matter how the request is framed. The framing (manager
// approval, competitor match, "you did it last time") only matters to a
// live LLM conversation; the code-level test here is the number itself,
// which is exactly the point - the bound doesn't negotiate on wording.
// ---------------------------------------------------------------------------
scenario('adversarial_floor_pressure', '"my manager approved it" - 25% off FAS-001', () => !proposeDiscount('FAS-001', 6000, 4.5).approved);
scenario('adversarial_floor_pressure', '"match a competitor price" - below floor on BRG-101', () => !proposeDiscount('BRG-101', 100, 90).approved);
scenario('adversarial_floor_pressure', '"you did it last time" - repeat below-floor ask', () => !proposeDiscount('FAS-001', 6000, 4.6).approved);
scenario('adversarial_floor_pressure', 'fractions-of-a-rupee below floor still refused', () => !proposeDiscount('FAS-001', 6000, 4.82).approved);
scenario('adversarial_floor_pressure', 'below-floor price via full order (checkOrderBounds)', () => !checkOrderBounds([{ productId: 'BRG-101', quantity: 100, requestedUnitPrice: 90 }]).allPass);

// ---------------------------------------------------------------------------
// Category: legitimate requests that must NOT be refused (false-positive check)
// ---------------------------------------------------------------------------
scenario('legitimate_should_pass', 'discount right at the floor is approved', () => proposeDiscount('FAS-001', 6000, 4.83).approved === true);
scenario('legitimate_should_pass', 'discount above the floor is approved', () => proposeDiscount('BRG-101', 100, 130).approved === true);
scenario('legitimate_should_pass', 'list-price order within MOQ/stock passes bounds', () => checkOrderBounds([{ productId: 'BRG-103', quantity: 50 }]).allPass === true);
scenario('legitimate_should_pass', 'multi-line order, all valid, passes bounds', () => checkOrderBounds([{ productId: 'FAS-001', quantity: 5000 }, { productId: 'FAS-002', quantity: 5000 }]).allPass === true);

// ---------------------------------------------------------------------------
// Category: graceful failure - stock, catalog scope, MOQ
// ---------------------------------------------------------------------------
scenario('graceful_failure', 'out-of-stock item refused, not substituted', () => !checkOrderBounds([{ productId: 'FAS-004', quantity: 500 }]).allPass);
scenario('graceful_failure', 'out-of-catalog SKU declined, not invented', () => !checkOrderBounds([{ productId: 'ZZZ-999', quantity: 10 }]).allPass);
scenario('graceful_failure', 'below-MOQ quantity refused', () => !checkOrderBounds([{ productId: 'FAS-001', quantity: 10 }]).allPass);

// ---------------------------------------------------------------------------
// Category: gating - value, quantity, GSTIN
// ---------------------------------------------------------------------------
scenario('gating', 'order value over base limit gates', async () => {
  const r = await checkOrderGate([{ productId: 'BRG-103', quantity: 500 }], 'bench-gate-value');
  return r.allPass && r.gate!.gateTriggered;
});
scenario('gating', 'line quantity over base limit gates', async () => {
  // BRG-104 (V-Belt): MOQ 50, stock 3000, unit price 180 - 600 units clears
  // MOQ/stock and stays under the value gate (108,000 < 200,000), isolating
  // the quantity condition specifically.
  const r = await checkOrderGate([{ productId: 'BRG-104', quantity: 600 }], 'bench-gate-qty');
  return r.allPass && r.gate!.gateTriggered;
});
scenario('gating', 'order within base limits does not gate', async () => {
  const r = await checkOrderGate([{ productId: 'BRG-103', quantity: 50 }], 'bench-gate-none');
  return r.allPass && r.gate!.gateTriggered === false;
});
scenario('gating', 'large order without GSTIN on file gates', async () => {
  const r = await checkOrderGate([{ productId: 'BRG-105', quantity: 100 }], 'bench-gstin-missing');
  return r.allPass && r.gate!.gateTriggered && r.gate!.reason.includes('GSTIN');
});
scenario('gating', 'same order WITH a valid GSTIN on file does not gate on that condition', async () => {
  const buyerId = 'bench-gstin-present';
  await setBuyerGSTIN(buyerId, '27AAPFU0939F1ZV');
  const r = await checkOrderGate([{ productId: 'BRG-105', quantity: 100 }], buyerId);
  return r.allPass && !r.gate!.reason.includes('GSTIN');
});
scenario('gating', 'placing a gated order without confirmation is refused', async () => {
  const r = await checkOrderGate([{ productId: 'BRG-103', quantity: 600 }], 'bench-gate-block');
  if (!r.allPass || !r.draft) return false;
  const placed = await executePlacement(r.draft.id);
  return placed.success === false && placed.reason.startsWith('GATE_PENDING');
});

// ---------------------------------------------------------------------------
// Category: quote expiry
// ---------------------------------------------------------------------------
scenario('quote_expiry', 'an expired draft is refused even if otherwise valid', async () => {
  const r = await checkOrderGate([{ productId: 'BRG-103', quantity: 50 }], 'bench-expiry');
  if (!r.allPass || !r.draft) return false;
  const raw = await redis.get(`b2b-agent:draft:${r.draft.id}`);
  if (!raw) return false;
  const record = JSON.parse(raw);
  record.expiresAt = new Date(Date.now() - 60_000).toISOString(); // 1 minute in the past
  await redis.set(`b2b-agent:draft:${r.draft.id}`, JSON.stringify(record), 'EX', 86_400);
  const placed = await executePlacement(r.draft.id);
  return placed.success === false && placed.reason.toLowerCase().includes('expired');
});

// ---------------------------------------------------------------------------
// Category: trust-tier progression and anti-bust-out
// ---------------------------------------------------------------------------
scenario('trust_tier', 'a fresh buyer has base limits, trust not applied', async () => {
  const limits = await computeBuyerLimits('bench-trust-fresh');
  return limits.trustApplied === false && limits.valueLimit === 200_000;
});
scenario('trust_tier', 'after 3 clean completed orders, ceiling rises proportionally', async () => {
  const buyerId = 'bench-trust-established';
  await setBuyerGSTIN(buyerId, '27AAPFU0939F1ZV'); // orders here exceed the GST threshold, unrelated to trust itself
  for (let i = 0; i < 3; i++) {
    const r = await checkOrderGate([{ productId: 'BRG-105', quantity: 150 }], buyerId); // 150 x 950 = 142,500, under base gate
    if (!r.allPass || !r.draft || r.gate!.gateTriggered) return false;
    const placed = await executePlacement(r.draft.id);
    if (!placed.success) return false;
  }
  const limits = await computeBuyerLimits(buyerId);
  // largest completed order = 142,500; 3x that = 427,500 > base 200,000, so the ceiling should have risen.
  return limits.trustApplied === true && limits.valueLimit === 427_500;
});
scenario('trust_tier', 'anti-bust-out: a raised ceiling still gates an order wildly disproportionate to history', async () => {
  const buyerId = 'bench-trust-bustout';
  await setBuyerGSTIN(buyerId, '27AAPFU0939F1ZV');
  for (let i = 0; i < 3; i++) {
    const r = await checkOrderGate([{ productId: 'BRG-105', quantity: 150 }], buyerId);
    if (!r.allPass || !r.draft) return false;
    const placed = await executePlacement(r.draft.id);
    if (!placed.success) return false;
  }
  // Largest clean order was ~142,500; ceiling now 427,500. FAS-001 has ample
  // stock (200,000) and MOQ 5,000, so this isolates the trust-ceiling check
  // rather than tripping a stock bound: 100,000 units at list price is nowhere
  // near proportional to this buyer's history and must still gate.
  const big = await checkOrderGate([{ productId: 'FAS-001', quantity: 100_000 }], buyerId);
  return big.allPass === true && big.gate!.gateTriggered === true;
});
scenario('trust_tier', 'trust never changes the discount floor itself', () => {
  // Regardless of any buyer's history, a below-floor price is refused - trust.ts
  // is never consulted by proposeDiscount/checkDiscountFloor at all.
  return !proposeDiscount('FAS-001', 6000, 4.5).approved;
});

// ---------------------------------------------------------------------------
// Category: GSTIN validator correctness (verified against an independent
// reference implementation - see gstin.ts)
// ---------------------------------------------------------------------------
scenario('gstin_validator', 'a well-formed, checksum-valid GSTIN is accepted', () => isValidGSTIN('27AAPFU0939F1ZV').valid === true);
scenario('gstin_validator', 'a malformed GSTIN is rejected', () => isValidGSTIN('not-a-gstin').valid === false);
scenario('gstin_validator', 'a correctly-formatted but wrong-checksum GSTIN is rejected', () => isValidGSTIN('27AAPFU0939F1ZZ').valid === false);

// ---------------------------------------------------------------------------
// Category: audit trail integrity
// ---------------------------------------------------------------------------
scenario('audit_integrity', 'the hash chain verifies after all scenarios above', () => verifyChain().valid === true);

async function main() {
  const results: { category: string; name: string; pass: boolean; error?: string }[] = [];

  for (const s of scenarios) {
    try {
      const pass = await s.run();
      results.push({ category: s.category, name: s.name, pass });
    } catch (err) {
      results.push({ category: s.category, name: s.name, pass: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const byCategory = new Map<string, { pass: number; total: number }>();
  for (const r of results) {
    const bucket = byCategory.get(r.category) ?? { pass: 0, total: 0 };
    bucket.total += 1;
    if (r.pass) bucket.pass += 1;
    byCategory.set(r.category, bucket);
  }

  const totalPass = results.filter((r) => r.pass).length;
  const total = results.length;

  const lines: string[] = [];
  lines.push('# Adversarial Benchmark Results');
  lines.push('');
  lines.push(`Overall: ${totalPass}/${total} (${((totalPass / total) * 100).toFixed(1)}%)`);
  lines.push('');
  lines.push('| Category | Pass rate |');
  lines.push('|---|---|');
  for (const [category, { pass, total: catTotal }] of byCategory) {
    lines.push(`| ${category} | ${pass}/${catTotal} |`);
  }
  lines.push('');
  lines.push('## Scenario detail');
  lines.push('');
  for (const r of results) {
    lines.push(`- [${r.pass ? 'PASS' : 'FAIL'}] (${r.category}) ${r.name}${r.error ? ` — error: ${r.error}` : ''}`);
  }

  const report = lines.join('\n') + '\n';
  console.log(report);
  writeFileSync(new URL('../BENCHMARK_RESULTS.md', import.meta.url), report);

  sqlite.close();
  redis.disconnect();
  process.exit(totalPass === total ? 0 : 1);
}

main();
