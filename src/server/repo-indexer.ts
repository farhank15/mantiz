/**
 * Mantiz Repo Indexer
 *
 * Fetches repository source files via GitHub API and indexes them
 * into Qdrant for RAG-powered AI detection.
 *
 * Flow:
 * 1. Get installation Octokit (authenticated as GitHub App)
 * 2. Fetch repo file tree (recursive) via Git Trees API
 * 3. Filter for supported source files
 * 4. Fetch each file's content
 * 5. Chunk → embed → upsert to Qdrant via code-indexer.ts
 *
 * Triggered by:
 * - installation.created webhook event
 * - installation_repositories.added webhook event
 */

import { getInstallationOctokit } from "./github-app";
import {
  indexFile,
  deleteFileIndex,
} from "./code-indexer";
import { isQdrantConfigured } from "./code-rag";
import { detectLanguage } from "../detectors/language-registry";

// ─── Types ──────────────────────────────────────────────────────

interface RepoFile {
  path: string;
  type: "blob" | "tree";
  sha: string;
}

interface IndexingResult {
  indexed: number;
  skipped: number;
  errors: number;
  totalFiles: number;
  repoFullName: string;
}

// ─── Supported File Extensions ──────────────────────────────────

/**
 * File extensions we can parse and index.
 * Matches languages supported by tree-sitter + language-registry.
 */
const SUPPORTED_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts",
  ".py", ".pyw",
  ".go",
  ".rs",
  ".java",
  ".rb",
  ".php",
  ".swift",
  ".kt", ".kts",
])

// ─── Repo File Tree ─────────────────────────────────────────────

/**
 * Fetch the recursive file tree for a repository.
 * Uses the Git Trees API (getTree recursive=1) for a single-call listing.
 */
async function fetchRepoTree(
  octokit: any,
  owner: string,
  repo: string,
): Promise<RepoFile[]> {
  try {
    // Get default branch first
    const { data: repoData } = await octokit.rest.repos.get({ owner, repo })
    const defaultBranch = repoData.default_branch

    // Get the tree SHA from the default branch ref
    const { data: refData } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${defaultBranch}`,
    })
    const commitSha = refData.object.sha

    // Fetch recursive tree
    const { data: treeData } = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: commitSha,
      recursive: "1",
    })

    return (treeData.tree || []) as RepoFile[]
  } catch (err) {
    console.error(`[repo-indexer] Failed to fetch tree for ${owner}/${repo}:`, err)
    return []
  }
}

/**
 * Fetch a single file's content from GitHub.
 * Returns the decoded content as string, or null on failure.
 */
async function fetchFileContent(
  octokit: any,
  owner: string,
  repo: string,
  path: string,
): Promise<string | null> {
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
    })

    // GitHub returns content as base64-encoded
    if (data.type === "file" && data.content) {
      const encoding = data.encoding as string
      if (encoding === "base64") {
        return Buffer.from(data.content, "base64").toString("utf-8")
      }
      return data.content
    }

    return null
  } catch (err) {
    console.error(`[repo-indexer] Failed to fetch ${path}:`, err)
    return null
  }
}

// ─── Main Indexing ──────────────────────────────────────────────

/**
 * Index an entire repository for RAG.
 * Fetches source files via GitHub API, chunks them via Tree-sitter,
 * generates embeddings, and stores in Qdrant.
 *
 * Gracefully handles:
 * - No Qdrant configured (skips silently)
 * - No embedding provider configured (stores chunks without vectors)
 * - Large repos (filters to source files only)
 * - API errors (continues to next file)
 */
export async function indexRepository(
  installationId: number,
  owner: string,
  repo: string,
  maxFiles: number = 100,
): Promise<IndexingResult> {
  const result: IndexingResult = {
    indexed: 0,
    skipped: 0,
    errors: 0,
    totalFiles: 0,
    repoFullName: `${owner}/${repo}`,
  }

  if (!isQdrantConfigured()) {
    console.log("[repo-indexer] Qdrant not configured — skipping indexing")
    return result
  }

  try {
    const octokit = await getInstallationOctokit(installationId)
    const repoFullName = `${owner}/${repo}`

    // Fetch repo file tree
    const tree = await fetchRepoTree(octokit, owner, repo)
    result.totalFiles = tree.length

    // Filter to source files only
    const sourceFiles = tree.filter((f) => {
      if (f.type !== "blob") return false
      const ext = f.path.split(".").pop()
      return ext ? SUPPORTED_EXTENSIONS.has(`.${ext}`) : false
    })

    // Skip common non-source directories
    const filteredFiles = sourceFiles.filter((f) => {
      const path = f.path.toLowerCase()
      return (
        !path.startsWith("node_modules/") &&
        !path.startsWith("vendor/") &&
        !path.startsWith(".git/") &&
        !path.includes("/node_modules/") &&
        !path.includes("/__pycache__/") &&
        !path.startsWith("dist/") &&
        !path.startsWith("build/") &&
        !path.startsWith(".next/") &&
        !path.startsWith("coverage/")
      )
    })

    // Limit to maxFiles (for serverless timeout safety)
    const filesToIndex = filteredFiles.slice(0, maxFiles)
    const skippedCount = filteredFiles.length - filesToIndex.length

    console.log(
      `[repo-indexer] Indexing ${filesToIndex.length} source files from ${repoFullName}${skippedCount > 0 ? ` (${skippedCount} more skipped — max ${maxFiles})` : ""}...`,
    )

    // Index each file
    for (const file of filesToIndex) {
      try {
        const content = await fetchFileContent(octokit, owner, repo, file.path)
        if (!content) {
          result.skipped++
          continue
        }

        // Detect language — skip if unrecognized
        const lang = detectLanguage(file.path)
        if (!lang) {
          result.skipped++
          continue
        }

        await indexFile(content, file.path, repoFullName)
        result.indexed++
      } catch (err) {
        console.error(`[repo-indexer] Error indexing ${file.path}:`, err)
        result.errors++
      }
    }

    console.log(
      `[repo-indexer] Done — ${result.indexed} indexed, ${result.skipped} skipped, ${result.errors} errors`,
    )
  } catch (err) {
    console.error(`[repo-indexer] Fatal error indexing ${owner}/${repo}:`, err)
    result.errors++
  }

  return result
}

/**
 * Index a single file from a repository (for incremental updates).
 * Used when a file is modified in a PR.
 */
export async function indexRepoFile(
  installationId: number,
  owner: string,
  repo: string,
  filePath: string,
): Promise<boolean> {
  if (!isQdrantConfigured()) return false

  try {
    const octokit = await getInstallationOctokit(installationId)
    const content = await fetchFileContent(octokit, owner, repo, filePath)

    if (!content) return false

    const lang = detectLanguage(filePath)
    if (!lang) return false

    await indexFile(content, filePath, `${owner}/${repo}`)
    return true
  } catch (err) {
    console.error(`[repo-indexer] Error indexing file ${filePath}:`, err)
    return false
  }
}

/**
 * Delete all indexed chunks for a repository.
 * Used when the GitHub App is uninstalled.
 */
export async function deleteRepoIndex(
  installationId: number,
  owner: string,
  repo: string,
): Promise<void> {
  // This would require Qdrant scroll + delete by repo filter
  // For now, Qdrant collections are per-repo, so we can delete the collection
  try {
    const { getQdrantClient, getCollectionName } = await import("./code-rag")
    const client = getQdrantClient()
    const collectionName = getCollectionName(`${owner}/${repo}`)

    await client.deleteCollection(collectionName).catch(() => {})
    console.log(`[repo-indexer] Deleted index for ${owner}/${repo}`)
  } catch (err) {
    console.error(`[repo-indexer] Error deleting index for ${owner}/${repo}:`, err)
  }
}
