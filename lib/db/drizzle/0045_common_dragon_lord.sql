CREATE TABLE "gifting_issue_returns" (
	"id" serial PRIMARY KEY NOT NULL,
	"issue_id" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"quantity" integer NOT NULL,
	"condition" "b2b_return_condition" NOT NULL,
	"response_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gifting_issue_returns_quantity_positive" CHECK ("gifting_issue_returns"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "gifting_issue_returns" ADD CONSTRAINT "gifting_issue_returns_issue_id_gifting_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."gifting_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gifting_issue_returns_idempotency_key_unique" ON "gifting_issue_returns" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "gifting_issue_returns_issue_key_unique" ON "gifting_issue_returns" USING btree ("issue_id","idempotency_key");