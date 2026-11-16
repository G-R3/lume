ALTER TABLE `library_sources` ADD `status` text NOT NULL;--> statement-breakpoint
ALTER TABLE `library_sources` ADD `last_scan_outcome` text DEFAULT 'unscanned' NOT NULL;--> statement-breakpoint
ALTER TABLE `library_sources` ADD `last_scan_error_message` text;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_library_sources` (
	`id` integer PRIMARY KEY,
	`path` text NOT NULL UNIQUE,
	`status` text NOT NULL,
	`last_scan_outcome` text DEFAULT 'unscanned' NOT NULL,
	`last_scanned_at` integer,
	`last_scan_error_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "library_sources_status_check" CHECK("status" IN ('active', 'off', 'forgotten')),
	CONSTRAINT "library_sources_scan_check" CHECK(("last_scan_outcome" = 'unscanned' AND "last_scanned_at" IS NULL AND "last_scan_error_message" IS NULL)
        OR ("last_scan_outcome" = 'ok' AND "last_scanned_at" IS NOT NULL AND "last_scan_error_message" IS NULL)
        OR ("last_scan_outcome" IN ('missing', 'permission', 'failed') AND "last_scan_error_message" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_library_sources`(`id`, `path`, `last_scanned_at`, `created_at`, `updated_at`) SELECT `id`, `path`, `last_scanned_at`, `created_at`, `updated_at` FROM `library_sources`;--> statement-breakpoint
DROP TABLE `library_sources`;--> statement-breakpoint
ALTER TABLE `__new_library_sources` RENAME TO `library_sources`;--> statement-breakpoint
PRAGMA foreign_keys=ON;