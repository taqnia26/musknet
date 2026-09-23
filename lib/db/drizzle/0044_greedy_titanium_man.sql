ALTER TYPE "public"."b2b_return_condition" ADD VALUE 'mixed';
--> statement-breakpoint
UPDATE "inventory_locations"
SET "name" = 'تيستر مفتوح (Opened Testers)'
WHERE "code" = 'B2B_USED_RETURN';