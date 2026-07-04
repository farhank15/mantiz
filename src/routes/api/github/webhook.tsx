import { createFileRoute } from "@tanstack/react-router";
import { db } from "../../../lib/db";
import { webhookDeliveries } from "../../../schemas/index";
import { eq } from "drizzle-orm";

// ─── Route Registration ─────────────────────────────────────────

export const Route = createFileRoute("/api/github/webhook")({
  component: () => null,
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // ─── Lazy-load server-only modules ────────────────────
          const ghApp = await import("../../../server/github-app");
          const ghPR = await import("../../../server/github-pr-comment");
          const engine = await import("../../../detectors/engine");

          const { parseWebhookRequest, isGitHubAppConfigured } = ghApp;
          const { postPRReviewComments, createCheckRun, completeCheckRun } =
            ghPR;

          if (!isGitHubAppConfigured()) {
            return Response.json(
              { error: "GitHub App not configured on server" },
              { status: 500, headers: { "Content-Type": "application/json" } },
            );
          }

          let event: {
            deliveryId: string;
            event: string;
            signature: string;
            rawBody: string;
            payload: Record<string, unknown>;
          };

          try {
            event = await parseWebhookRequest(request);
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Invalid webhook";
            return Response.json(
              { error: message },
              { status: 401, headers: { "Content-Type": "application/json" } },
            );
          }

          const { deliveryId, event: eventType, payload } = event;

          // ─── Idempotency: check if already processed ────────────
          const existing = await db.query.webhookDeliveries.findFirst({
            where: eq(webhookDeliveries.githubDeliveryId, deliveryId),
          });

          if (existing) {
            if (existing.status === "completed") {
              return Response.json(
                { status: "skipped", reason: "Already processed", deliveryId },
                {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }
            // Still processing — return 202 to avoid duplicate, don't block
            if (existing.status === "processing") {
              const elapsed =
                Date.now() - new Date(existing.createdAt).getTime();
              if (elapsed < 120_000) {
                return Response.json(
                  { status: "still_processing", deliveryId },
                  {
                    status: 202,
                    headers: { "Content-Type": "application/json" },
                  },
                );
              }
              // Stale processing (> 2 min) — allow retry
            }
          }

          // Save delivery record
          const payloadAny = payload as any;
          const installationId = payloadAny.installation?.id || null;
          const repoFullName = payloadAny.repository?.full_name || null;

          const [delivery] = await db
            .insert(webhookDeliveries)
            .values({
              githubDeliveryId: deliveryId,
              eventType,
              action: payloadAny.action || null,
              installationId,
              repositoryFullName: repoFullName,
              status: "processing",
            })
            .onConflictDoNothing()
            .returning();

          // ─── Extract shared module references ─────────────────
          const {
            saveInstallation,
            removeInstallation,
            updateInstallationRepos,
            getInstallationRepos,
            getInstallationOctokit,
          } = ghApp;
          const { scanDiffAsync } = engine;

          // Helper to get repo full name from payload for RAG indexing
          const getRepoFullName = (): string | null => {
            if (payloadAny.repository?.full_name) return payloadAny.repository.full_name
            if (payloadAny.repositories?.[0]?.full_name) return payloadAny.repositories[0].full_name
            return null
          }

          switch (eventType) {
            // ── Installation Events ────────────────────────────────
            case "installation": {
              const action = payloadAny.action as string;
              const inst = payloadAny.installation as any;

              if (
                action === "created" ||
                action === "new_permissions_accepted"
              ) {
                const repos =
                  (payloadAny.repositories as Array<{ id: number; full_name?: string }>) || [];
                await saveInstallation({
                  installationId: inst.id,
                  accountId: inst.account?.id || 0,
                  accountLogin: inst.account?.login || "unknown",
                  accountType: inst.account?.type || "User",
                  repoIds: repos.map((r: { id: number }) => r.id),
                });

                // ── Index repo for RAG (blocking with timeout) ────
                // Index first 50 source files (best-effort within 30s timeout).
                // Full indexing of large repos needs a background worker.
                for (const repo of repos) {
                  if (repo.full_name) {
                    const [ownerName, repoSlug] = repo.full_name.split("/")
                    if (ownerName && repoSlug) {
                      try {
                        const { indexRepository } = await import("../../../server/repo-indexer")
                        await Promise.race([
                          indexRepository(inst.id, ownerName, repoSlug, 50),
                          new Promise((_, reject) =>
                            setTimeout(() => reject(new Error("Indexing timeout (30s)")), 30_000)
                          ),
                        ])
                      } catch (indexErr) {
                        console.error(`[webhook] Index error for ${repo.full_name}:`, indexErr)
                      }
                    }
                  }
                }
              } else if (action === "deleted") {
                await removeInstallation(inst.id);

                // Optionally clean up Qdrant index
                const repoFullName = getRepoFullName()
                if (repoFullName) {
                  const { deleteRepoIndex } = await import("../../../server/repo-indexer")
                  const [ownerName, repoSlug] = repoFullName.split("/")
                  if (ownerName && repoSlug) {
                    await deleteRepoIndex(inst.id, ownerName, repoSlug).catch(() => {})
                  }
                }
              }
              break;
            }

            // ── Installation Repository Events ─────────────────────
            case "installation_repositories": {
              const instId = payloadAny.installation?.id as number;
              const reposAdded =
                (payloadAny.repositories_added as Array<{ id: number; full_name?: string }>) || [];
              const reposRemoved =
                (payloadAny.repositories_removed as Array<{ id: number; full_name?: string }>) ||
                [];

              const currentRepos = await getInstallationRepos(instId);
              const updatedRepos = currentRepos.filter(
                (id) => !reposRemoved.some((r) => r.id === id),
              );
              for (const repo of reposAdded) {
                if (!updatedRepos.includes(repo.id)) {
                  updatedRepos.push(repo.id);
                }

                // Index newly added repos (blocking with timeout)
                if (repo.full_name) {
                  const [ownerName, repoSlug] = repo.full_name.split("/")
                  if (ownerName && repoSlug) {
                    try {
                      const { indexRepository } = await import("../../../server/repo-indexer")
                      await Promise.race([
                        indexRepository(instId, ownerName, repoSlug, 50),
                        new Promise((_, reject) =>
                          setTimeout(() => reject(new Error("Indexing timeout (30s)")), 30_000)
                        ),
                      ])
                    } catch (indexErr) {
                      console.error(`[webhook] Index error for ${repo.full_name}:`, indexErr)
                    }
                  }
                }
              }
              await updateInstallationRepos(instId, updatedRepos);
              break;
            }

            // ── Pull Request Events ────────────────────────────────
            case "pull_request": {
              const action = payloadAny.action as string;

              // Only scan on opened or synchronized (new commits)
              if (action !== "opened" && action !== "synchronize") {
                break;
              }

              const pr = payloadAny.pull_request as any;
              const repo = payloadAny.repository as any;
              const instId = payloadAny.installation?.id as number;

              if (!pr || !repo || !instId) {
                throw new Error(
                  "Missing pull_request, repository, or installation in payload",
                );
              }

              const owner = repo.owner?.login || repo.owner?.name;
              const repoName = repo.name;
              const repoFullName = repo.full_name || `${owner}/${repoName}`;
              const pullNumber = pr.number;
              const headSha = pr.head?.sha;

              if (!owner || !repoName || !pullNumber || !headSha) {
                throw new Error(
                  "Missing owner/repo/pull_number/head_sha in payload",
                );
              }

              // ── Create check run (in_progress) ─────────────────
              const octokit = await getInstallationOctokit(instId);
              const checkRunId = await createCheckRun(octokit, {
                owner,
                repo: repoName,
                headSha,
                installationId: instId,
              });

              try {
                // ── Fetch PR diff ─────────────────────────────────
                const diffUrl = pr.diff_url;
                const diffRes = await fetch(diffUrl, {
                  headers: {
                    Accept: "application/vnd.github.v3.diff",
                  },
                });
                if (!diffRes.ok) {
                  throw new Error(`Failed to fetch diff: ${diffRes.status}`);
                }
                const diffText = await diffRes.text();

                // ── Query RAG for code context ─────────────────────
                // Extract potential custom matcher/function names from the diff
                // and search Qdrant for their definitions.
                // This helps the AI judge avoid false positives on legit APIs.
                let ragContext: string | undefined
                try {
                  const { searchSymbol, isQdrantConfigured } = await import("../../../server/code-rag")

                  if (isQdrantConfigured()) {
                    // Extract .methodName( patterns from diff
                    const dotCallPattern = /\.([a-zA-Z]\w*)\s*\(/g
                    const names = new Set<string>()
                    let match
                    while ((match = dotCallPattern.exec(diffText)) !== null) {
                      const name = match[1]
                      // Only query for potential custom matchers (not built-in JS)
                      if (name.length > 2 && !["map", "filter", "reduce", "forEach", "then", "catch", "finally", "toUpperCase", "toLowerCase", "trim", "split", "join", "slice", "splice", "push", "pop", "shift", "unshift", "includes", "indexOf", "replace", "match", "test"].includes(name)) {
                        names.add(name)
                      }
                    }

                    // Query Qdrant for each name (parallel, limit to 10)
                    const foundDefs: Array<{ name: string; filePath: string; content: string; startLine: number }> = []
                    const nameArray = Array.from(names).slice(0, 10)
                    const results = await Promise.all(
                      nameArray.map((name) =>
                        searchSymbol(name, repoFullName).then(r => ({ name, r }))
                      )
                    )
                    for (const { name, r: result } of results) {
                      if (result.found && result.definition) {
                        foundDefs.push({
                          name,
                          filePath: result.definition.filePath,
                          content: result.definition.content,
                          startLine: result.definition.startLine,
                        })
                      }
                    }

                    if (foundDefs.length > 0) {
                      const { buildRagContext } = await import("../../../server/code-rag")
                      ragContext = buildRagContext(
                        foundDefs.map(d => ({
                          filePath: d.filePath,
                          symbolName: d.name,
                          content: d.content,
                          startLine: d.startLine,
                          score: 1,
                        })),
                        3000,
                      )
                    }
                  }
                } catch (ragErr) {
                  // RAG query failed — continue without context
                  console.error("[webhook] RAG query error:", ragErr)
                }

                // ── Run Mantiz scan (with RAG context) ────────────
                const result = await scanDiffAsync(diffText, {
                  title: pr.title || "",
                  author: pr.user?.login || pr.head?.user?.login || "unknown",
                }, ragContext);

                // ── Post PR review comments ───────────────────────
                await postPRReviewComments(octokit, {
                  owner,
                  repo: repoName,
                  pullNumber,
                  findings: result.findings,
                  trustScore: result.trustScore,
                  totalFindings: result.summary.totalFindings,
                });

                // ── Complete check run ────────────────────────────
                await completeCheckRun(octokit, {
                  owner,
                  repo: repoName,
                  checkRunId,
                  findings: result.findings,
                  trustScore: result.trustScore,
                  totalFindings: result.summary.totalFindings,
                });

                // ── Update delivery status ────────────────────────
                if (delivery?.id) {
                  await db
                    .update(webhookDeliveries)
                    .set({
                      status: "completed",
                      completedAt: new Date(),
                    })
                    .where(eq(webhookDeliveries.id, delivery.id));
                }
              } catch (scanErr) {
                // ── Scan failed — mark check run as failure ──────
                const message =
                  scanErr instanceof Error ? scanErr.message : "Scan failed";
                console.error("[webhook] Scan error:", message);

                try {
                  await octokit.rest.checks.update({
                    owner,
                    repo: repoName,
                    check_run_id: checkRunId,
                    status: "completed",
                    conclusion: "failure",
                    completed_at: new Date().toISOString(),
                    output: {
                      title: "Mantiz AI Lie Detector",
                      summary: `❌ Scan failed: ${message.slice(0, 200)}`,
                    },
                  });
                } catch {}

                if (delivery?.id) {
                  await db
                    .update(webhookDeliveries)
                    .set({
                      status: "failed",
                      errorMessage: message.slice(0, 500),
                      completedAt: new Date(),
                    })
                    .where(eq(webhookDeliveries.id, delivery.id));
                }
              }
              break;
            }

            default:
              // Unknown event — mark as skipped
              if (delivery?.id) {
                await db
                  .update(webhookDeliveries)
                  .set({
                    status: "skipped",
                    completedAt: new Date(),
                  })
                  .where(eq(webhookDeliveries.id, delivery.id));
              }
          }

          return Response.json(
            { status: "ok", deliveryId },
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Internal server error";
          console.error("[webhook] Unhandled error:", message);

          return Response.json(
            { error: message },
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
