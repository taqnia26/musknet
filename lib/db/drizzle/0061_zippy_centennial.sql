ALTER TABLE "owner_obligations" ADD COLUMN "renewal_of" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "owner_obligations_renewal_of_unique" ON "owner_obligations" USING btree ("renewal_of");