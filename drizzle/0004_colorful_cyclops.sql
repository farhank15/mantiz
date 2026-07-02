CREATE TABLE IF NOT EXISTS "user_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "threshold" integer DEFAULT 70 NOT NULL,
  "ai_enabled" boolean DEFAULT false NOT NULL,
  "min_score" integer DEFAULT 0 NOT NULL,
  "webhook_url" text,
  "webhook_enabled" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "scan_id" uuid REFERENCES "scans"("id"),
  "webhook_url" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "response_code" integer,
  "response_body" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "delivered_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_settings_user_id_idx" ON "user_settings" USING btree ("user_id");
