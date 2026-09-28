PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_playlist_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
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
INSERT INTO `__new_playlist_entries`(`id`, `playlist_id`, `track_id`, `position`, `created_at`) SELECT `id`, `playlist_id`, `track_id`, `position`, `created_at` FROM `playlist_entries`;--> statement-breakpoint
DROP TABLE `playlist_entries`;--> statement-breakpoint
ALTER TABLE `__new_playlist_entries` RENAME TO `playlist_entries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `playlist_entries_track` ON `playlist_entries` (`playlist_id`,`track_id`);
