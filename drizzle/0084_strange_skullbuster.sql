ALTER TABLE `app_users` ADD `passwordResetToken` varchar(64);--> statement-breakpoint
ALTER TABLE `app_users` ADD `passwordResetExpiresAt` bigint;