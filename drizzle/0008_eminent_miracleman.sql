CREATE TABLE "github_installs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" bigint NOT NULL,
	"account_id" bigint,
	"account_login" text,
	"account_type" text,
	"repo_ids" bigint[] DEFAULT '{}' NOT NULL,
	"permissions" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "github_installs_installation_id_unique" UNIQUE("installation_id")
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_delivery_id" text NOT NULL,
	"event_type" text NOT NULL,
	"action" text,
	"installation_id" bigint,
	"repository_full_name" text,
	"status" text DEFAULT 'processing' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "webhook_deliveries_github_delivery_id_unique" UNIQUE("github_delivery_id")
);
