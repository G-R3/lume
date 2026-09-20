CREATE TABLE `artwork` (
	`id` text PRIMARY KEY NOT NULL,
	`media_type` text NOT NULL,
	`data` blob NOT NULL
);
--> statement-breakpoint
CREATE TABLE `library_sources` (
	`id` integer PRIMARY KEY,
	`path` text NOT NULL UNIQUE,
	`enabled` integer NOT NULL,
	`forgotten_at` integer,
	`last_scanned_at` integer,
	`last_scan_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "library_sources_enabled_check" CHECK("enabled" IN (0, 1))
);
--> statement-breakpoint
CREATE TABLE `playlist_entries` (
	`id` integer PRIMARY KEY,
	`playlist_id` integer NOT NULL,
	`track_id` integer NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_playlist_entries_playlist_id_playlists_id_fk` FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_playlist_entries_track_id_tracks_id_fk` FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`),
	CONSTRAINT `playlist_entries_playlist_id_position_unique` UNIQUE(`playlist_id`,`position`),
	CONSTRAINT "playlist_entries_position_check" CHECK("position" >= 0)
);
--> statement-breakpoint
CREATE TABLE `playlists` (
	`id` integer PRIMARY KEY,
	`title` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "playlists_title_check" CHECK("title" = trim("title") AND length("title") BETWEEN 1 AND 100),
	CONSTRAINT "playlists_description_check" CHECK("description" IS NULL OR length("description") BETWEEN 1 AND 300)
);
--> statement-breakpoint
CREATE TABLE `track_state` (
	`track_id` integer PRIMARY KEY,
	`starred_at` integer,
	CONSTRAINT `fk_track_state_track_id_tracks_id_fk` FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `tracks` (
	`id` integer PRIMARY KEY,
	`source_id` integer NOT NULL,
	`path` text NOT NULL UNIQUE,
	`title` text NOT NULL,
	`duration` real,
	`format` text NOT NULL,
	`file_size` integer NOT NULL,
	`modified_at` integer NOT NULL,
	`available` integer NOT NULL,
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
	CONSTRAINT "tracks_available_check" CHECK("available" IN (0, 1)),
	CONSTRAINT "tracks_lossless_check" CHECK("lossless" IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX `playlist_entries_track` ON `playlist_entries` (`playlist_id`,`track_id`);--> statement-breakpoint
CREATE INDEX `playlists_created_at` ON `playlists` (`created_at`);--> statement-breakpoint
CREATE INDEX `tracks_source_id` ON `tracks` (`source_id`);--> statement-breakpoint
CREATE INDEX `tracks_available` ON `tracks` (`available`);--> statement-breakpoint
CREATE INDEX `tracks_artwork_id` ON `tracks` (`artwork_id`);