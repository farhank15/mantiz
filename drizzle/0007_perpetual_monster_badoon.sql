CREATE TABLE "rate_limit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "rate_limit_events_key_timestamp_idx" ON "rate_limit_events" USING btree ("key","timestamp");