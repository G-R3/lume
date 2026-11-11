CREATE TABLE `app_state` (
	`id` integer PRIMARY KEY,
	`onboarded_at` integer NOT NULL,
	CONSTRAINT "app_state_singleton_check" CHECK("id" = 1)
);
