ALTER TABLE "jobs" DROP CONSTRAINT "jobs_item_id_items_id_fk";
--> statement-breakpoint
DROP INDEX "jobs_item_idx";--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN "item_id";