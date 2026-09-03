CREATE TYPE "public"."accounting_account_type" AS ENUM('asset', 'liability', 'equity', 'revenue', 'expense');--> statement-breakpoint
CREATE TYPE "public"."accounting_normal_balance" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."journal_audit_action" AS ENUM('created', 'updated', 'posted', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."journal_entry_status" AS ENUM('draft', 'posted', 'reversed');--> statement-breakpoint
CREATE TABLE "accounting_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"account_type" "accounting_account_type" NOT NULL,
	"normal_balance" "accounting_normal_balance" NOT NULL,
	"parent_id" integer,
	"is_posting" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounting_accounts_code_not_blank" CHECK (btrim("accounting_accounts"."code") <> ''),
	CONSTRAINT "accounting_accounts_names_not_blank" CHECK (btrim("accounting_accounts"."name_ar") <> '' and btrim("accounting_accounts"."name_en") <> ''),
	CONSTRAINT "accounting_accounts_parent_not_self" CHECK ("accounting_accounts"."parent_id" is null or "accounting_accounts"."parent_id" <> "accounting_accounts"."id")
);
--> statement-breakpoint
CREATE TABLE "expense_category_account_mappings" (
	"category" "expense_category" PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"entry_number" text NOT NULL,
	"entry_date" date NOT NULL,
	"description" text NOT NULL,
	"status" "journal_entry_status" DEFAULT 'draft' NOT NULL,
	"source_type" text,
	"source_id" text,
	"reversal_of_entry_id" integer,
	"created_by" integer NOT NULL,
	"posted_by" integer,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_entries_number_not_blank" CHECK (btrim("journal_entries"."entry_number") <> ''),
	CONSTRAINT "journal_entries_description_not_blank" CHECK (btrim("journal_entries"."description") <> ''),
	CONSTRAINT "journal_entries_source_complete" CHECK (("journal_entries"."source_type" is null and "journal_entries"."source_id" is null) or (btrim("journal_entries"."source_type") <> '' and btrim("journal_entries"."source_id") <> '')),
	CONSTRAINT "journal_entries_posting_audit_valid" CHECK (("journal_entries"."status" = 'draft' and "journal_entries"."posted_at" is null and "journal_entries"."posted_by" is null)
      or ("journal_entries"."status" in ('posted', 'reversed') and "journal_entries"."posted_at" is not null and "journal_entries"."posted_by" is not null)),
	CONSTRAINT "journal_entries_reversal_not_self" CHECK ("journal_entries"."reversal_of_entry_id" is null or "journal_entries"."reversal_of_entry_id" <> "journal_entries"."id")
);
--> statement-breakpoint
CREATE TABLE "journal_entry_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"journal_entry_id" integer NOT NULL,
	"action" "journal_audit_action" NOT NULL,
	"actor_id" integer NOT NULL,
	"changes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entry_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"journal_entry_id" integer NOT NULL,
	"line_number" integer NOT NULL,
	"account_id" integer NOT NULL,
	"description" text,
	"debit" numeric(19, 4) DEFAULT '0' NOT NULL,
	"credit" numeric(19, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_entry_lines_line_number_positive" CHECK ("journal_entry_lines"."line_number" > 0),
	CONSTRAINT "journal_entry_lines_single_side_positive" CHECK (("journal_entry_lines"."debit" > 0 and "journal_entry_lines"."credit" = 0) or ("journal_entry_lines"."credit" > 0 and "journal_entry_lines"."debit" = 0))
);
--> statement-breakpoint
ALTER TABLE "accounting_accounts" ADD CONSTRAINT "accounting_accounts_parent_id_accounting_accounts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."accounting_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_category_account_mappings" ADD CONSTRAINT "expense_category_account_mappings_account_id_accounting_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounting_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversal_of_entry_id_journal_entries_id_fk" FOREIGN KEY ("reversal_of_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_posted_by_admin_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_audit" ADD CONSTRAINT "journal_entry_audit_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_audit" ADD CONSTRAINT "journal_entry_audit_actor_id_admin_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_account_id_accounting_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounting_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_accounts_code_unique" ON "accounting_accounts" USING btree ("code");--> statement-breakpoint
CREATE INDEX "accounting_accounts_parent_idx" ON "accounting_accounts" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "accounting_accounts_type_active_idx" ON "accounting_accounts" USING btree ("account_type","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "expense_category_account_mappings_account_unique" ON "expense_category_account_mappings" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_number_unique" ON "journal_entries" USING btree ("entry_number");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_source_unique" ON "journal_entries" USING btree ("source_type","source_id") WHERE "journal_entries"."source_type" is not null and "journal_entries"."source_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_reversal_unique" ON "journal_entries" USING btree ("reversal_of_entry_id") WHERE "journal_entries"."reversal_of_entry_id" is not null;--> statement-breakpoint
CREATE INDEX "journal_entries_date_idx" ON "journal_entries" USING btree ("entry_date");--> statement-breakpoint
CREATE INDEX "journal_entries_status_date_idx" ON "journal_entries" USING btree ("status","entry_date");--> statement-breakpoint
CREATE INDEX "journal_entry_audit_entry_created_idx" ON "journal_entry_audit" USING btree ("journal_entry_id","created_at");--> statement-breakpoint
CREATE INDEX "journal_entry_audit_actor_idx" ON "journal_entry_audit" USING btree ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entry_lines_entry_line_unique" ON "journal_entry_lines" USING btree ("journal_entry_id","line_number");--> statement-breakpoint
CREATE INDEX "journal_entry_lines_account_idx" ON "journal_entry_lines" USING btree ("account_id");
--> statement-breakpoint
CREATE FUNCTION "accounting_protect_posted_entry"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('posted', 'reversed') THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'posted journal entries are immutable';
    END IF;
    IF OLD.status = 'posted' AND NEW.status = 'reversed'
      AND NEW.entry_number IS NOT DISTINCT FROM OLD.entry_number
      AND NEW.entry_date IS NOT DISTINCT FROM OLD.entry_date
      AND NEW.description IS NOT DISTINCT FROM OLD.description
      AND NEW.source_type IS NOT DISTINCT FROM OLD.source_type
      AND NEW.source_id IS NOT DISTINCT FROM OLD.source_id
      AND NEW.reversal_of_entry_id IS NOT DISTINCT FROM OLD.reversal_of_entry_id
      AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
      AND NEW.posted_by IS NOT DISTINCT FROM OLD.posted_by
      AND NEW.posted_at IS NOT DISTINCT FROM OLD.posted_at
      AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
    THEN
      IF NOT EXISTS (
        SELECT 1 FROM journal_entries reversal
        WHERE reversal.reversal_of_entry_id = OLD.id AND reversal.status = 'posted'
      ) THEN
        RAISE EXCEPTION 'a posted reversing entry is required before reversal';
      END IF;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'posted journal entries are immutable';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER "journal_entries_immutable"
BEFORE UPDATE OR DELETE ON "journal_entries"
FOR EACH ROW EXECUTE FUNCTION "accounting_protect_posted_entry"();
--> statement-breakpoint
CREATE FUNCTION "accounting_protect_posted_lines"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE entry_status journal_entry_status;
BEGIN
  SELECT status INTO entry_status FROM journal_entries
    WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.journal_entry_id ELSE NEW.journal_entry_id END;
  IF entry_status IN ('posted', 'reversed') THEN
    RAISE EXCEPTION 'posted journal entry lines are immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
--> statement-breakpoint
CREATE TRIGGER "journal_entry_lines_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "journal_entry_lines"
FOR EACH ROW EXECUTE FUNCTION "accounting_protect_posted_lines"();
--> statement-breakpoint
CREATE FUNCTION "accounting_assert_balanced_entry"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE target_id integer;
DECLARE entry_status journal_entry_status;
DECLARE line_count integer;
DECLARE debit_total numeric(19,4);
DECLARE credit_total numeric(19,4);
BEGIN
  IF TG_TABLE_NAME = 'journal_entries' THEN
    target_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    target_id := OLD.journal_entry_id;
  ELSE
    target_id := NEW.journal_entry_id;
  END IF;
  SELECT status INTO entry_status FROM journal_entries WHERE id = target_id;
  IF entry_status IN ('posted', 'reversed') THEN
    SELECT count(*), COALESCE(sum(debit), 0), COALESCE(sum(credit), 0)
      INTO line_count, debit_total, credit_total
      FROM journal_entry_lines WHERE journal_entry_id = target_id;
    IF line_count < 2 OR debit_total <= 0 OR debit_total <> credit_total THEN
      RAISE EXCEPTION 'posted journal entry % must contain at least two balanced lines', target_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "journal_entries_balanced"
AFTER INSERT OR UPDATE ON "journal_entries"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "accounting_assert_balanced_entry"();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "journal_entry_lines_balanced"
AFTER INSERT OR UPDATE OR DELETE ON "journal_entry_lines"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "accounting_assert_balanced_entry"();