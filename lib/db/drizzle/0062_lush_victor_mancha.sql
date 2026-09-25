ALTER TABLE "owner_obligation_events" DROP CONSTRAINT "owner_obligation_events_status_valid";--> statement-breakpoint
ALTER TABLE "owner_obligation_events" ADD COLUMN "correction_reason" text;--> statement-breakpoint
ALTER TABLE "owner_obligation_events" ADD COLUMN "correction_evidence" text;--> statement-breakpoint
ALTER TABLE "owner_obligation_events" ADD COLUMN "corrected_by" integer;--> statement-breakpoint
ALTER TABLE "owner_obligation_events" ADD COLUMN "corrected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "owner_obligation_events" ADD COLUMN "reversal_entry_id" integer;--> statement-breakpoint
ALTER TABLE "owner_obligation_events" ADD CONSTRAINT "owner_obligation_events_corrected_by_admin_users_id_fk" FOREIGN KEY ("corrected_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_obligation_events" ADD CONSTRAINT "owner_obligation_events_reversal_entry_id_journal_entries_id_fk" FOREIGN KEY ("reversal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_obligation_events" ADD CONSTRAINT "owner_obligation_events_status_valid" CHECK ("owner_obligation_events"."status" in ('pending', 'approved', 'rejected', 'corrected'));