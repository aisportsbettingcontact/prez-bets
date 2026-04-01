ALTER TABLE `app_users` ADD `discordId` varchar(32);--> statement-breakpoint
ALTER TABLE `app_users` ADD `discordUsername` varchar(64);--> statement-breakpoint
ALTER TABLE `app_users` ADD `discordAvatar` varchar(128);--> statement-breakpoint
ALTER TABLE `app_users` ADD `discordConnectedAt` bigint;