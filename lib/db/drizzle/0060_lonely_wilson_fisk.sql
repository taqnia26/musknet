CREATE TABLE "owner_installment_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"installment_id" integer NOT NULL,
	"previous_date" date NOT NULL,
	"previous_amount" numeric(19, 4) NOT NULL,
	"next_date" date NOT NULL,
	"next_amount" numeric(19, 4) NOT NULL,
	"changed_by" integer NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "owner_installment_revisions" ADD CONSTRAINT "owner_installment_revisions_installment_id_owner_obligation_installments_id_fk" FOREIGN KEY ("installment_id") REFERENCES "public"."owner_obligation_installments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_installment_revisions" ADD CONSTRAINT "owner_installment_revisions_changed_by_owner_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."owner_users"("id") ON DELETE no action ON UPDATE no action;