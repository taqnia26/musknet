CREATE TABLE "owner_journal_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"journal_entry_id" integer NOT NULL,
	"decision" text NOT NULL,
	"reason" text NOT NULL,
	"evidence" text NOT NULL,
	"reviewed_by" integer NOT NULL,
	"reversal_entry_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owner_journal_reviews_decision_valid" CHECK ("owner_journal_reviews"."decision" in ('retain', 'reverse'))
);
--> statement-breakpoint
CREATE TABLE "owner_obligation_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"obligation_id" integer NOT NULL,
	"kind" text NOT NULL,
	"amount" numeric(19, 4),
	"event_date" date NOT NULL,
	"payer" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"client_key" text NOT NULL,
	"evidence" text,
	"account_code" text,
	"reason" text,
	"journal_entry_id" integer,
	"created_by_owner" integer,
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owner_obligation_events_kind_valid" CHECK ("owner_obligation_events"."kind" in ('payment', 'transfer')),
	CONSTRAINT "owner_obligation_events_status_valid" CHECK ("owner_obligation_events"."status" in ('pending', 'approved', 'rejected')),
	CONSTRAINT "owner_obligation_events_amount_valid" CHECK ("owner_obligation_events"."amount" is null or "owner_obligation_events"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "owner_obligation_installments" (
	"id" serial PRIMARY KEY NOT NULL,
	"obligation_id" integer NOT NULL,
	"due_date" date NOT NULL,
	"amount" numeric(19, 4) NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owner_obligation_installments_amount_positive" CHECK ("owner_obligation_installments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "owner_obligations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"amount" numeric(19, 4) NOT NULL,
	"due_date" date NOT NULL,
	"recurrence" text DEFAULT 'once' NOT NULL,
	"liable_party" text NOT NULL,
	"client_key" text NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owner_obligations_amount_positive" CHECK ("owner_obligations"."amount" > 0),
	CONSTRAINT "owner_obligations_party_valid" CHECK ("owner_obligations"."liable_party" in ('owner', 'company')),
	CONSTRAINT "owner_obligations_recurrence_valid" CHECK ("owner_obligations"."recurrence" in ('once', 'monthly'))
);
--> statement-breakpoint
ALTER TABLE "owner_journal_reviews" ADD CONSTRAINT "owner_journal_reviews_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_journal_reviews" ADD CONSTRAINT "owner_journal_reviews_reviewed_by_admin_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_journal_reviews" ADD CONSTRAINT "owner_journal_reviews_reversal_entry_id_journal_entries_id_fk" FOREIGN KEY ("reversal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_obligation_events" ADD CONSTRAINT "owner_obligation_events_obligation_id_owner_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."owner_obligations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_obligation_events" ADD CONSTRAINT "owner_obligation_events_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_obligation_events" ADD CONSTRAINT "owner_obligation_events_created_by_owner_owner_users_id_fk" FOREIGN KEY ("created_by_owner") REFERENCES "public"."owner_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_obligation_events" ADD CONSTRAINT "owner_obligation_events_reviewed_by_admin_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_obligation_installments" ADD CONSTRAINT "owner_obligation_installments_obligation_id_owner_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."owner_obligations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_obligation_installments" ADD CONSTRAINT "owner_obligation_installments_created_by_owner_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."owner_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_obligations" ADD CONSTRAINT "owner_obligations_created_by_owner_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."owner_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "owner_journal_reviews_entry_unique" ON "owner_journal_reviews" USING btree ("journal_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "owner_obligation_events_client_key_unique" ON "owner_obligation_events" USING btree ("client_key");--> statement-breakpoint
CREATE UNIQUE INDEX "owner_obligation_events_journal_unique" ON "owner_obligation_events" USING btree ("journal_entry_id");--> statement-breakpoint
CREATE INDEX "owner_obligation_events_obligation_idx" ON "owner_obligation_events" USING btree ("obligation_id");--> statement-breakpoint
CREATE INDEX "owner_obligation_installments_obligation_idx" ON "owner_obligation_installments" USING btree ("obligation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "owner_obligations_client_key_unique" ON "owner_obligations" USING btree ("client_key");