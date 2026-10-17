DROP INDEX "files_bucket_path_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "files_bucket_path_uidx" ON "files" USING btree ("bucket","path");