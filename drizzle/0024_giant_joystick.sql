ALTER TABLE `games` ADD `modelAwayScore` decimal(6,2);--> statement-breakpoint
ALTER TABLE `games` ADD `modelHomeScore` decimal(6,2);--> statement-breakpoint
ALTER TABLE `games` ADD `modelOverRate` decimal(5,2);--> statement-breakpoint
ALTER TABLE `games` ADD `modelUnderRate` decimal(5,2);--> statement-breakpoint
ALTER TABLE `games` ADD `modelAwayWinPct` decimal(5,2);--> statement-breakpoint
ALTER TABLE `games` ADD `modelHomeWinPct` decimal(5,2);--> statement-breakpoint
ALTER TABLE `games` ADD `modelSpreadClamped` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `games` ADD `modelTotalClamped` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `games` ADD `modelCoverDirection` varchar(8);--> statement-breakpoint
ALTER TABLE `games` ADD `modelRunAt` bigint;