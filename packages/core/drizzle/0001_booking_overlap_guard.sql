ALTER TABLE "appointments" ADD COLUMN "block_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "block_end" timestamp with time zone;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
-- The serialisation point for two callers offered one slot. The NULL guards are
-- load-bearing: tstzrange(NULL, NULL) is the unbounded range.
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_no_overlap" EXCLUDE USING gist (
  "agent_id" WITH =,
  tstzrange("block_start", "block_end") WITH &&
) WHERE ("status" = 'confirmed' AND "block_start" IS NOT NULL AND "block_end" IS NOT NULL);
