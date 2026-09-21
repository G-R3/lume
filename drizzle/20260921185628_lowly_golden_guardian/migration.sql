PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_library_sources` (
	`id` integer PRIMARY KEY,
	`path` text NOT NULL UNIQUE,
	`enabled` integer NOT NULL,
	`forgotten_at` integer,
	`last_scanned_at` integer,
	`last_scan_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "library_sources_enabled_check" CHECK("enabled" IN (0, 1)),
	CONSTRAINT "library_sources_forgotten_check" CHECK("forgotten_at" IS NULL OR "enabled" = 0)
);
--> statement-breakpoint
INSERT INTO `__new_library_sources`(`id`, `path`, `enabled`, `forgotten_at`, `last_scanned_at`, `last_scan_error`, `created_at`, `updated_at`) SELECT `id`, `path`, `enabled`, `forgotten_at`, `last_scanned_at`, `last_scan_error`, `created_at`, `updated_at` FROM `library_sources`;--> statement-breakpoint
DROP TABLE `library_sources`;--> statement-breakpoint
ALTER TABLE `__new_library_sources` RENAME TO `library_sources`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
