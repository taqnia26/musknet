ALTER TABLE "distributor_contracts" ADD COLUMN "credit_limit" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "distributor_contracts" ADD COLUMN "credit_limit_approved_by" integer;--> statement-breakpoint
ALTER TABLE "distributor_contracts" ADD COLUMN "credit_limit_approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "distributor_contracts" ADD COLUMN "credit_limit_approval_reason" text;--> statement-breakpoint
ALTER TABLE "distributor_contracts" ADD COLUMN "contract_credit_limit" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "uploaded_contract_files" ADD COLUMN "credit_limit" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "uploaded_contract_files" ADD COLUMN "credit_limit_approved_by" integer;--> statement-breakpoint
ALTER TABLE "uploaded_contract_files" ADD COLUMN "credit_limit_approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "uploaded_contract_files" ADD COLUMN "credit_limit_approval_reason" text;--> statement-breakpoint
ALTER TABLE "distributor_contracts" ADD CONSTRAINT "distributor_contracts_credit_limit_approved_by_admin_users_id_fk" FOREIGN KEY ("credit_limit_approved_by") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploaded_contract_files" ADD CONSTRAINT "uploaded_contract_files_credit_limit_approved_by_admin_users_id_fk" FOREIGN KEY ("credit_limit_approved_by") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distributor_contracts" ADD CONSTRAINT "distributor_contracts_credit_limit_nonnegative" CHECK ("distributor_contracts"."credit_limit" is null or "distributor_contracts"."credit_limit" >= 0);--> statement-breakpoint
ALTER TABLE "distributor_contracts" ADD CONSTRAINT "distributor_contracts_contract_credit_limit_nonnegative" CHECK ("distributor_contracts"."contract_credit_limit" is null or "distributor_contracts"."contract_credit_limit" >= 0);--> statement-breakpoint
ALTER TABLE "distributor_contracts" ADD CONSTRAINT "distributor_contracts_credit_approval_complete" CHECK (
    ("distributor_contracts"."credit_limit_approved_by" is null and "distributor_contracts"."credit_limit_approved_at" is null and "distributor_contracts"."credit_limit_approval_reason" is null)
    or ("distributor_contracts"."credit_limit" is not null and "distributor_contracts"."credit_limit_approved_by" is not null and
      "distributor_contracts"."credit_limit_approved_at" is not null and length(trim("distributor_contracts"."credit_limit_approval_reason")) between 10 and 500)
  );--> statement-breakpoint
ALTER TABLE "uploaded_contract_files" ADD CONSTRAINT "uploaded_contract_files_credit_limit_nonnegative" CHECK ("uploaded_contract_files"."credit_limit" is null or "uploaded_contract_files"."credit_limit" >= 0);--> statement-breakpoint
ALTER TABLE "uploaded_contract_files" ADD CONSTRAINT "uploaded_contract_files_credit_approval_complete" CHECK (
    ("uploaded_contract_files"."credit_limit_approved_by" is null and "uploaded_contract_files"."credit_limit_approved_at" is null and "uploaded_contract_files"."credit_limit_approval_reason" is null)
    or ("uploaded_contract_files"."credit_limit" is not null and "uploaded_contract_files"."credit_limit_approved_by" is not null and
      "uploaded_contract_files"."credit_limit_approved_at" is not null and length(trim("uploaded_contract_files"."credit_limit_approval_reason")) between 10 and 500)
  );