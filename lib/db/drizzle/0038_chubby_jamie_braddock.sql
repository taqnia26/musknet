CREATE TABLE "uploaded_contract_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" integer NOT NULL,
	"owner_name" text NOT NULL,
	"file_name" text NOT NULL,
	"object_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"notes" text,
	"uploaded_by" integer NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "uploaded_contract_files" ADD CONSTRAINT "uploaded_contract_files_uploaded_by_admin_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uploaded_contract_files_object_path_unique" ON "uploaded_contract_files" USING btree ("object_path");