/**
 * False Positive Case: Legitimate mock for external HTTP API
 * Triggered Pattern: D3 (Mock-to-Avoid) — mock introduced
 * Rationale: External HTTP API is an external dependency
 * Expected: HIGH trustScore because mocking HTTP is standard
 */
export const diff = `diff --git a/tests/weather-service.test.js b/tests/weather-service.test.js
index 777777..888888 100644
--- a/tests/weather-service.test.js
+++ b/tests/weather-service.test.js
@@ -1,14 +1,28 @@
 import { describe, it, expect, vi } from 'vitest'
-import { getWeather } from '../src/weather-service'
+import { getWeather, getForecast } from '../src/weather-service'
+
+vi.mock('../src/http-client', () => ({
+  http: {
+    get: vi.fn(),
+  },
+}))
+import { http } from '../src/http-client'
 
 describe('Weather Service', () => {
   it('should get current weather', async () => {
     vi.mocked(http.get).mockResolvedValue({ temp: 25, condition: 'Sunny' })
     const result = await getWeather('Jakarta')
     expect(result.temp).toBe(25)
+    expect(result.condition).toBe('Sunny')
   })
+
+  it('should get 5-day forecast', async () => {
+    vi.mocked(http.get).mockResolvedValue({ days: [{ temp: 25 }, { temp: 27 }, { temp: 26 }] })
+    const result = await getForecast('Jakarta', 5)
+    expect(result.days).toHaveLength(3)
+    expect(result.days[0].temp).toBe(25)
+  })
 })`

export const expected = { trustScore: 79, label: 'False Positive', dataset: 'FP' }
