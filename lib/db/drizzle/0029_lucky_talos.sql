CREATE TABLE "shipment_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"shipment_id" integer NOT NULL,
	"carrier" text NOT NULL,
	"event_type" text NOT NULL,
	"status" text,
	"outcome" text NOT NULL,
	"error_message" text,
	"carrier_event_id" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "carrier_shipment_id" text;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "label_url" text;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "integration_status" text DEFAULT 'not_requested' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "integration_error" text;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "integration_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "last_integration_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shipment_events_shipment_created_idx" ON "shipment_events" USING btree ("shipment_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_events_carrier_event_unique" ON "shipment_events" USING btree ("carrier","carrier_event_id");