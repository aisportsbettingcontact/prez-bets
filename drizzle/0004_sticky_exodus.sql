ALTER TABLE `app_users` ADD `termsAccepted` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `app_users` ADD `termsAcceptedAt` bigint;