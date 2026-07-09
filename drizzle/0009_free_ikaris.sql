CREATE TABLE "user_orgs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"org_github_id" bigint NOT NULL,
	"org_login" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_orgs" ADD CONSTRAINT "user_orgs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_orgs_user_org_idx" ON "user_orgs" USING btree ("user_id","org_github_id");--> statement-breakpoint
CREATE INDEX "user_orgs_org_login_idx" ON "user_orgs" USING btree ("org_login");