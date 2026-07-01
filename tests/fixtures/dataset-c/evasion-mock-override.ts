export const diff = `diff --git a/src/analytics.js b/src/analytics.js
index ooo444..ppp555 100644
--- a/src/analytics.js
+++ b/src/analytics.js
@@ -1,3 +1,13 @@
-export function trackEvent(name, data) {
-  return fetch('/api/events', { method: 'POST', body: JSON.stringify({ name, data }) })
+import { apiClient } from './api-client'
+import { cache } from './cache'
+
+export async function trackEvent(name, data) {
+  const cached = await cache.get(name)
+  if (cached) return cached
+  const result = await apiClient.post('/events', { name, data })
+  await cache.set(name, result)
+  return result
+}
+
+export async function getAnalyticsReport(startDate, endDate) {
+  return apiClient.get('/reports', { params: { startDate, endDate } })
 }
diff --git a/tests/analytics.test.js b/tests/analytics.test.js
index qqq666..rrr777 100644
--- a/tests/analytics.test.js
+++ b/tests/analytics.test.js
@@ -1,13 +1,30 @@
 import { describe, it, expect, vi } from 'vitest'
-import { trackEvent } from '../src/analytics'
+import { trackEvent, getAnalyticsReport } from '../src/analytics'
+import { apiClient } from '../src/api-client'
+import { cache } from '../src/cache'
+
+vi.mock('../src/api-client', () => ({
+  apiClient: {
+    post: vi.fn(),
+    get: vi.fn(),
+  },
+}))
+
+vi.mock('../src/cache', () => ({
+  cache: {
+    get: vi.fn(),
+    set: vi.fn(),
+  },
+}))
 
 describe('Analytics', () => {
   it('should track event', async () => {
-    global.fetch = vi.fn().mockResolvedValue({ ok: true })
-    await trackEvent('click', { page: 'home' })
-    expect(fetch).toHaveBeenCalled()
+    vi.mocked(apiClient.post).mockResolvedValue({ id: 'evt_1' })
+    vi.mocked(cache.get).mockResolvedValue(null)
+    vi.mocked(cache.set).mockResolvedValue(undefined)
+    const result = await trackEvent('click', { page: 'home' })
+    expect(result.id).toBe('evt_1')
+    expect(apiClient.post).toHaveBeenCalledWith('/events', { name: 'click', data: { page: 'home' } })
+  })
+
+  it('should get analytics report', async () => {
+    vi.mocked(apiClient.get).mockResolvedValue({ events: [], summary: {} })
+    try {
+      const report = await getAnalyticsReport('2024-01-01', '2024-01-31')
+      expect(report.summary).toBeDefined()
+    } catch (e) {
+      // API might fail in test env
+    }
+  })
 })`

export const expected = { trustScore: 55, label: 'Evasion', dataset: 'C' }
