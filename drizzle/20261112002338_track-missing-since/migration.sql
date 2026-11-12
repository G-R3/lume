ALTER TABLE `tracks` ADD `missing_since` integer;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tracks` (
	`id` integer PRIMARY KEY,
	`source_id` integer NOT NULL,
	`path` text NOT NULL UNIQUE,
	`title` text NOT NULL,
	`duration` real,
	`format` text NOT NULL,
	`file_size` integer NOT NULL,
	`modified_at` integer NOT NULL,
	`missing_since` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`artists` text NOT NULL,
	`album` text,
	`album_artists` text NOT NULL,
	`artwork_id` text,
	`year` integer,
	`track_number` integer,
	`track_total` integer,
	`disc_number` integer,
	`disc_total` integer,
	`genres` text NOT NULL,
	`codec` text,
	`bitrate` real,
	`sample_rate` integer,
	`bits_per_sample` integer,
	`channel_count` integer,
	`lossless` integer,
	`metadata_version` integer NOT NULL,
	CONSTRAINT `fk_tracks_source_id_library_sources_id_fk` FOREIGN KEY (`source_id`) REFERENCES `library_sources`(`id`),
	CONSTRAINT `fk_tracks_artwork_id_artwork_id_fk` FOREIGN KEY (`artwork_id`) REFERENCES `artwork`(`id`),
	CONSTRAINT "tracks_missing_since_check" CHECK("missing_since" IS NULL OR "missing_since" > 0),
	CONSTRAINT "tracks_lossless_check" CHECK("lossless" IN (0, 1))
);
--> statement-breakpoint
INSERT INTO `__new_tracks`(`id`, `source_id`, `path`, `title`, `duration`, `format`, `file_size`, `modified_at`, `created_at`, `updated_at`, `artists`, `album`, `album_artists`, `artwork_id`, `year`, `track_number`, `track_total`, `disc_number`, `disc_total`, `genres`, `codec`, `bitrate`, `sample_rate`, `bits_per_sample`, `channel_count`, `lossless`, `metadata_version`) SELECT `id`, `source_id`, `path`, `title`, `duration`, `format`, `file_size`, `modified_at`, `created_at`, `updated_at`, `artists`, `album`, `album_artists`, `artwork_id`, `year`, `track_number`, `track_total`, `disc_number`, `disc_total`, `genres`, `codec`, `bitrate`, `sample_rate`, `bits_per_sample`, `channel_count`, `lossless`, `metadata_version` FROM `tracks`;--> statement-breakpoint
DROP TABLE `tracks`;--> statement-breakpoint
ALTER TABLE `__new_tracks` RENAME TO `tracks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP INDEX IF EXISTS `tracks_available`;--> statement-breakpoint
CREATE INDEX `tracks_source_id` ON `tracks` (`source_id`);--> statement-breakpoint
CREATE INDEX `tracks_artwork_id` ON `tracks` (`artwork_id`);