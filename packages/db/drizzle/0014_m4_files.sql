ALTER TYPE "public"."file_kind" ADD VALUE 'paperwork';--> statement-breakpoint
ALTER TYPE "public"."file_owner_type" ADD VALUE 'shopping_line';--> statement-breakpoint
ALTER TYPE "public"."file_owner_type" ADD VALUE 'payment';--> statement-breakpoint
ALTER TYPE "public"."file_owner_type" ADD VALUE 'estimate';--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "caption" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "taken_on" date;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "job_id" uuid;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "cover_file_id" uuid;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_cover_file_id_files_id_fk" FOREIGN KEY ("cover_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_job_idx" ON "files" USING btree ("job_id");--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_job_ck" CHECK ("files"."job_id" IS NULL OR "files"."kind"::text = 'progress_photo');--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_size_ck" CHECK ("files"."size_bytes" >= 0);