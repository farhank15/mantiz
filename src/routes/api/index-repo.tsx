import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/index-repo")({
  component: () => null,
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // ── Auth ─────────────────────────────────────────────────
          const authHeader = request.headers.get("authorization") || "";
          const match = authHeader.match(/^Bearer\s+(.+)$/i);
          const token = match?.[1];

          if (!token) {
            return Response.json(
              { error: "Authorization header required" },
              { status: 401, headers: { "Content-Type": "application/json" } },
            );
          }

          const { verifyToken } = await import("../../server/tokens");
          const user = await verifyToken(token);
          if (!user) {
            return Response.json(
              { error: "Invalid API token" },
              { status: 401, headers: { "Content-Type": "application/json" } },
            );
          }

          // ── Parse body ───────────────────────────────────────────
          const ct = request.headers.get("content-type") || "";
          if (!ct.includes("application/json")) {
            return Response.json(
              { error: "Content-Type must be application/json" },
              { status: 415, headers: { "Content-Type": "application/json" } },
            );
          }

          const body = (await request.json()) as {
            repo?: string;
            installationId?: number;
          };
          const repoFullName = body.repo;
          if (!repoFullName || typeof repoFullName !== "string") {
            return Response.json(
              { error: 'Missing required field: repo (e.g. "owner/repo")' },
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }
          const bodyInstallationId = body.installationId;

          // ── Check Qdrant configured ──────────────────────────────
          const { isQdrantConfigured } = await import("../../server/code-rag");
          if (!isQdrantConfigured()) {
            return Response.json(
              {
                error: "Qdrant not configured",
                hint: "Set QDRANT_URL (or CLUSTER_ENDPOINT) and QDRANT_API_KEY in Vercel env vars",
              },
              { status: 503, headers: { "Content-Type": "application/json" } },
            );
          }

          // ── Find installation ID ─────────────────────────────────
          let installationId: number | null = bodyInstallationId ?? null;

          if (!installationId) {
            const { db } = await import("../../lib/db");
            const { githubInstalls } = await import("../../schemas/index");

            const installs = await db.select().from(githubInstalls);
            if (installs.length > 0) {
              installationId = installs[0].installationId;
              console.log(
                `[api/index-repo] Auto-resolved installation ${installationId} (${installs.length} total installs)`,
              );
            }
          }

          if (!installationId) {
            return Response.json(
              {
                error: "No GitHub App installation found",
                hint: `Install the Mantiz GitHub App on ${repoFullName} first, then retry with installationId in the body. Or provide installationId directly: {"installationId": <number>}`,
              },
              { status: 404, headers: { "Content-Type": "application/json" } },
            );
          }

          // ── Run indexing ─────────────────────────────────────────
          const [ownerName, repoSlug] = repoFullName.split("/");
          if (!ownerName || !repoSlug) {
            return Response.json(
              { error: "Invalid repo format. Expected: owner/repo" },
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          const { indexRepository } = await import("../../server/repo-indexer");
          console.log(
            `[api/index-repo] Starting indexing for ${repoFullName} (installation ${installationId})...`,
          );

          const result = await Promise.race([
            indexRepository(installationId, ownerName, repoSlug, 100),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error("Indexing timeout (120s)")),
                120_000,
              ),
            ),
          ]);

          console.log(
            `[api/index-repo] Done — ${result.indexed} indexed, ${result.skipped} skipped, ${result.errors} errors`,
          );

          return Response.json(
            {
              success: true,
              repo: repoFullName,
              indexed: result.indexed,
              skipped: result.skipped,
              errors: result.errors,
              totalFiles: result.totalFiles,
              message: `Indexed ${result.indexed} files from ${repoFullName}${result.errors > 0 ? ` (${result.errors} errors)` : ""}`,
            },
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Internal server error";
          console.error("[api/index-repo] Error:", err);
          return Response.json(
            { error: message },
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
