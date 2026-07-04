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
                  (payloadAny.repositories as Array<{ id: number }>) || [];
                await saveInstallation({
                  installationId: inst.id,
                  accountId: inst.account?.id || 0,
                  accountLogin: inst.account?.login || "unknown",
                  accountType: inst.account?.type || "User",
                  repoIds: repos.map((r: { id: number }) => r.id),
                });
              } else if (action === "deleted") {
                await removeInstallation(inst.id);
              }
              break;
            }

            // ── Installation Repository Events ─────────────────────
            case "installation_repositories": {
              const instId = payloadAny.installation?.id as number;
              const reposAdded =
                (payloadAny.repositories_added as Array<{ id: number }>) || [];
              const reposRemoved =
                (payloadAny.repositories_removed as Array<{ id: number }>) ||
                [];

              const currentRepos = await getInstallationRepos(instId);
              const updatedRepos = currentRepos.filter(
                (id) => !reposRemoved.some((r) => r.id === id),
              );
              for (const repo of reposAdded) {
                if (!updatedRepos.includes(repo.id)) {
                  updatedRepos.push(repo.id);
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

                // ── Run Mantiz scan ───────────────────────────────
                const result = await scanDiffAsync(diffText, {
                  title: pr.title || "",
                  author: pr.user?.login || pr.head?.user?.login || "unknown",
                });

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
