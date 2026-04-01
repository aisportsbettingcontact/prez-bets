ALTER TABLE `mlb_lineups` ADD `lineupHash` varchar(64);--> statement-breakpoint
ALTER TABLE `mlb_lineups` ADD `lineupVersion` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `mlb_lineups` ADD `lineupModeledAt` bigint;--> statement-breakpoint
ALTER TABLE `mlb_lineups` ADD `lineupModeledVersion` int DEFAULT 0 NOT NULL;