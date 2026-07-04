/**
 * Mantiz Embedding Provider
 *
 * Abstraction layer for text embedding generation.
 * Supports OpenAI and Fireworks AI (both use identical API format).
 *
 * Provider selection (priority order):
 * 1. FIREWORKS_API_KEY → Fireworks AI (nomic-embed-text-v1.5 default, $0.008/1M tokens)
 * 2. OPENAI_API_KEY    → OpenAI (text-embedding-3-small default)
 * 3. Neither           → Embeddings disabled, graceful fallback
 *
 * Default model is nomic-embed-text-v1.5 ($0.008/1M tokens) — 12.5x cheaper
 * than Qwen3 and perfectly adequate for code RAG.
 *
 * Pricing (Fireworks):
 *   nomic-embed-text-v1.5: ~$0.008 / 1M tokens (default) 🔥
 *   qwen3-embedding-8b:    ~$0.10  / 1M tokens
 *   bge-base-en-v1.5:      ~$0.008 / 1M tokens
 *
 * Cost estimate per repo:
 *   Small (300 functions): ~$0.00036
 *   Medium (3K functions): ~$0.0036
 *   Large (30K functions): ~$0.036
 *
 * Override via env:
 *   EMBEDDING_MODEL=fireworks/qwen3-embedding-8b   (for higher quality)
 *   EMBEDDING_DIMENSIONS=1024                       (match model dimensions)
 */

// ─── Types ──────────────────────────────────────────────────────

export interface EmbeddingConfig {
  provider: "openai" | "fireworks"
  apiKey: string
  baseUrl: string
  model: string
  dimensions: number
}

export type ProviderName = "openai" | "fireworks"

// ─── Provider Configs ───────────────────────────────────────────

const PROVIDER_CONFIGS: Record<
  ProviderName,
  {
    baseUrl: string
    defaultModel: string
    defaultDimensions: number
    envKey: string
  }
> = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "text-embedding-3-small",
    defaultDimensions: 1536,
    envKey: "OPENAI_API_KEY",
  },
  fireworks: {
    baseUrl: "https://api.fireworks.ai/inference/v1",
    defaultModel: "nomic-ai/nomic-embed-text-v1.5",
    defaultDimensions: 768,
    envKey: "FIREWORKS_API_KEY",
  },
}

// ─── Configuration ──────────────────────────────────────────────

/**
 * Get the active embedding provider configuration.
 * Returns null if no provider is configured.
 */
export function getEmbeddingConfig(): EmbeddingConfig | null {
  const apiKey =
    typeof process !== "undefined"
      ? process.env.FIREWORKS_API_KEY || process.env.OPENAI_API_KEY
      : undefined

  if (!apiKey) return null

  // Determine provider from env var
  const provider: ProviderName =
    typeof process !== "undefined" && !!process.env.FIREWORKS_API_KEY
      ? "fireworks"
      : "openai"

  const cfg = PROVIDER_CONFIGS[provider]
  const model =
    typeof process !== "undefined"
      ? process.env.EMBEDDING_MODEL || cfg.defaultModel
      : cfg.defaultModel

  // Dimensions: env override > model default > provider default
  const dimsEnv =
    typeof process !== "undefined"
      ? process.env.EMBEDDING_DIMENSIONS
      : undefined
  const dimensions = dimsEnv ? parseInt(dimsEnv, 10) : cfg.defaultDimensions

  return {
    provider,
    apiKey,
    baseUrl: cfg.baseUrl,
    model,
    dimensions: isNaN(dimensions) ? cfg.defaultDimensions : dimensions,
  }
}

/**
 * Check if any embedding provider is configured.
 */
export function isEmbeddingConfigured(): boolean {
  return getEmbeddingConfig() !== null
}

/**
 * Get the current vector dimension size.
 * Used by Qdrant collection creation to match the embedding model.
 */
export function getVectorSize(): number {
  return getEmbeddingConfig()?.dimensions ?? 1536
}

/**
 * Get the current provider name for logging/metrics.
 */
export function getProviderName(): string {
  return getEmbeddingConfig()?.provider ?? "none"
}

// ─── Pricing (per provider) ──────────────────────────────────

/**
 * Estimated price per 1M tokens by model prefix.
 * Sources: fireworks.ai/pricing, openai.com/pricing (2026)
 */
const MODEL_PRICING: Record<string, number> = {
  // Fireworks — BERT-based models (< 150M params)
  "nomic-ai/nomic-embed": 0.008,
  "BAAI/bge-": 0.008,
  "sentence-transformers/all-MiniLM": 0.008,
  "mxbai-embed": 0.008,
  // Fireworks — larger open-source models
  "fireworks/qwen3-embedding-8b": 0.10,
  "fireworks/qwen3-embedding-4b": 0.04,
  "fireworks/qwen3-embedding-0p6b": 0.008,
  // OpenAI
  "text-embedding-3-small": 0.02,
  "text-embedding-3-large": 0.13,
}

/**
 * Estimate cost per 1M tokens for a given model.
 */
function estimateModelPrice(model: string): number {
  for (const [prefix, price] of Object.entries(MODEL_PRICING)) {
    if (model.includes(prefix)) return price
  }
  // Default: assume mid-range
  return 0.05
}

// ─── Embedding Generation ──────────────────────────────────────

interface EmbeddingResponse {
  data: Array<{
    embedding: number[]
    index: number
  }>
  usage: {
    prompt_tokens: number
    total_tokens: number
  }
}

let cumulativeTokens = 0
let cumulativeCost = 0

/**
 * Reset the cumulative cost counter (e.g. at start of a scan).
 */
export function resetCostCounter(): void {
  cumulativeTokens = 0
  cumulativeCost = 0
}

/**
 * Get cumulative token usage and cost since last reset.
 */
export function getCostSummary(): {
  totalTokens: number
  totalCost: number
  model: string
  provider: string
} {
  const config = getEmbeddingConfig()
  return {
    totalTokens: cumulativeTokens,
    totalCost: Math.round(cumulativeCost * 10000) / 10000,
    model: config?.model ?? "none",
    provider: config?.provider ?? "none",
  }
}

/**
 * Generate embeddings for an array of text chunks.
 * Batches up to 20 chunks per request.
 * Returns empty array if no provider is configured.
 * Logs token usage and estimated cost for cost transparency.
 */
export async function generateEmbeddings(
  texts: string[],
): Promise<number[][]> {
  const config = getEmbeddingConfig()
  if (!config) {
    console.warn(
      "[embedding-provider] No API key set — set FIREWORKS_API_KEY or OPENAI_API_KEY",
    )
    return []
  }

  const pricePer1M = estimateModelPrice(config.model)
  const embeddings: number[][] = []
  const BATCH_SIZE = 20

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)

    const res = await fetch(`${config.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        input: batch,
        dimensions: config.dimensions,
      }),
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => "")
      throw new Error(
        `[${config.provider}] Embedding API error ${res.status}: ${errBody.slice(0, 200)}`,
      )
    }

    const data = (await res.json()) as EmbeddingResponse
    const batchEmbeddings = data.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding)

    embeddings.push(...batchEmbeddings)

    // ─── Cost logging ────────────────────────────────────
    const batchTokens = data.usage?.total_tokens ?? 0
    const batchCost = (batchTokens / 1_000_000) * pricePer1M
    cumulativeTokens += batchTokens
    cumulativeCost += batchCost

    console.log(
      `[embedding] ${config.provider}/${config.model.split("/").pop()} ` +
      `batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(texts.length / BATCH_SIZE)}: ` +
      `${batchTokens} tok → $${batchCost.toFixed(6)} ` +
      `(total: ${cumulativeTokens} tok → $${(Math.round(cumulativeCost * 10000) / 10000).toFixed(4)})`,
    )
  }

  return embeddings
}
