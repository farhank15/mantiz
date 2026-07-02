CREATE TABLE "author_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"scan_id" uuid,
	"event_type" text NOT NULL,
	"trust_score" integer NOT NULL,
	"total_findings" integer DEFAULT 0 NOT NULL,
	"files_changed" integer DEFAULT 0 NOT NULL,
	"title_style_hash" text,
	"commit_hour" integer NOT NULL,
	"metadata" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "author_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_author" text NOT NULL,
	"first_seen" timestamp DEFAULT now() NOT NULL,
	"last_seen" timestamp DEFAULT now() NOT NULL,
	"total_scans" integer DEFAULT 0 NOT NULL,
	"avg_trust_score" integer DEFAULT 100 NOT NULL,
	"avg_files_changed" integer DEFAULT 1 NOT NULL,
	"writing_style_hashes" text[] DEFAULT '{}' NOT NULL,
	"suspicion_score" integer DEFAULT 0 NOT NULL,
	"last_flagged_at" timestamp,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"peak_daily_frequency" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "author_profiles_github_author_unique" UNIQUE("github_author")
);
--> statement-breakpoint
CREATE TABLE "shared_scans" (
	"id" text PRIMARY KEY NOT NULL,
	"scan_data" text NOT NULL,
	"source_type" text NOT NULL,
	"source_ref" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "author_events" ADD CONSTRAINT "author_events_author_id_author_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."author_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_events" ADD CONSTRAINT "author_events_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE no action ON UPDATE no action;