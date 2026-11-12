DROP TABLE `playback_position`;--> statement-breakpoint
DROP TABLE `playback_session`;--> statement-breakpoint
CREATE TABLE `playback_session` (
	`id` integer PRIMARY KEY,
	`payload` text NOT NULL,
	`position` real NOT NULL,
	CONSTRAINT "playback_session_singleton" CHECK("id" = 1),
	CONSTRAINT "playback_session_position_check" CHECK("position" >= 0)
);
