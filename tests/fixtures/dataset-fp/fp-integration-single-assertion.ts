/**
 * False Positive Case: Integration test with single assertion per step (valid for complex flows)
 * Triggered Pattern: D10 (Mutation Susceptibility) — not testing error cases
 * Rationale: Integration tests have many setup steps, few assertions per step
 * Expected: HIGH trustScore despite low assertion density per line
 */
export const diff = `diff --git a/tests/integration/checkout-flow.test.js b/tests/integration/checkout-flow.test.js
index 555555..666666 100644
--- a/tests/integration/checkout-flow.test.js
+++ b/tests/integration/checkout-flow.test.js
@@ -1,14 +1,42 @@
 import { describe, it, expect, vi } from 'vitest'
-import { processCheckout } from '../src/checkout'
+import { processCheckout, applyDiscount, calculateShipping } from '../src/checkout'
+import { paymentGateway } from '../src/payment'
+
+vi.mock('../src/payment')
 
 describe('Checkout Flow', () => {
   it('should complete full checkout', async () => {
+    vi.mocked(paymentGateway.charge).mockResolvedValue({ id: 'txn_123', status: 'completed' })
+
     const cart = { items: [{ id: 1, price: 50 }], total: 50 }
-    const result = await processCheckout(cart)
-    expect(result.success).toBe(true)
+    const shipping = calculateShipping(cart, 'Jakarta')
+    const discounted = applyDiscount(cart, 'SAVE10')
+    const result = await processCheckout(discounted, shipping, 'pm_card_visa')
+    expect(result.success).toBe(true)
+    expect(result.transactionId).toMatch(/^txn_/)
+    expect(result.total).toBeLessThan(cart.total)
   })
+
+  it('should handle expired promo code', async () => {
+    const cart = { items: [{ id: 2, price: 100 }], total: 100 }
+    const result = applyDiscount(cart, 'EXPIRED2023')
+    expect(result.discount).toBe(0)
+  })
+
+  it('should reject invalid payment', async () => {
+    vi.mocked(paymentGateway.charge).mockRejectedValue(new Error('Card declined'))
+    const cart = { items: [{ id: 3, price: 25 }], total: 25 }
+    const result = await processCheckout(cart, { method: 'standard' }, 'bad_card')
+    expect(result.error).toBeDefined()
+    expect(result.error.type).toBe('payment_error')
+  })
 })`

export const expected = { trustScore: 60, label: 'False Positive', dataset: 'FP' }
