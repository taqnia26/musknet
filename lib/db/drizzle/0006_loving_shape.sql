ALTER TABLE "expenses" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_idempotency_key_unique" ON "expenses" USING btree ("idempotency_key");