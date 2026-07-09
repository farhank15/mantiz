import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { deliverWebhook } from './webhook'
import { db } from '../lib/db'
import { webhookEvents } from '../schemas/index'

// Mock database interactions
vi.mock('../lib/db', () => {
  return {
    db: {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue([{ id: 'mock-event-id' }]),
      }),
    },
  }
})

describe('Webhook System unit tests', () => {
  let originalFetch: typeof fetch

  beforeEach(() => {
    originalFetch = global.fetch
    vi.clearAllMocks()
    vi.useFakeTimers()
    // Suppress console.error in tests for retries
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('should deliver webhook successfully on first attempt', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
    }
    global.fetch = vi.fn().mockResolvedValue(mockResponse)

    const params = {
      userId: 'user-123',
      webhookUrl: 'https://example.com/webhook',
      scanId: 'scan-456',
      payload: {
        trustScore: 85,
        totalFindings: 1,
        highCount: 0,
        mediumCount: 1,
        lowCount: 0,
        filesScanned: 3,
        passed: true,
        threshold: 70,
        findings: [
          {
            patternType: 'disabled_assertion',
            filePath: 'test.js',
            lineStart: 10,
            lineEnd: 12,
            confidence: 'high',
            explanation: 'Skipped test',
          },
        ],
      },
    }

    await deliverWebhook(params)

    // Verify fetch was called once
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, requestInit] = (global.fetch as any).mock.calls[0]
    expect(url).toBe('https://example.com/webhook')
    expect(requestInit.method).toBe('POST')
    expect(requestInit.headers['Content-Type']).toBe('application/json')
    expect(requestInit.headers['X-Mantiz-Event']).toBe('scan.completed')
    expect(requestInit.headers['X-Mantiz-Signature']).toBeDefined()
    expect(requestInit.headers['X-Mantiz-Attempt']).toBe('1')

    // Verify DB logging
    expect(db.insert).toHaveBeenCalledWith(webhookEvents)
  })

  it('should retry up to 3 times and save failure on complete exhaust', async () => {
    // Mock fetch throwing network errors
    global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'))

    const params = {
      userId: 'user-123',
      webhookUrl: 'https://example.com/webhook',
      scanId: 'scan-456',
      payload: {
        trustScore: 40,
        totalFindings: 2,
        highCount: 1,
        mediumCount: 1,
        lowCount: 0,
        filesScanned: 2,
        passed: false,
        threshold: 70,
        findings: [],
      },
    }

    // Trigger the async call in background
    const promise = deliverWebhook(params)

    // Wait and advance timers for all retry delays (1s, 4s, 15s)
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(4000)
    await vi.advanceTimersByTimeAsync(15000)

    // Await completion
    await promise

    // Should attempt 3 times (1 initial + 2 retries)
    expect(global.fetch).toHaveBeenCalledTimes(3)

    // DB insert should be called with status failed after final attempt
    expect(db.insert).toHaveBeenCalledWith(webhookEvents)
  })
})
