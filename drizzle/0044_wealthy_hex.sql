CREATE TABLE `mlb_pitcher_stats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`mlbamId` int NOT NULL,
	`fullName` varchar(128) NOT NULL,
	`teamAbbrev` varchar(8) NOT NULL,
	`era` double,
	`k9` double,
	`bb9` double,
	`hr9` double,
	`whip` double,
	`ip` double,
	`gamesStarted` int,
	`gamesPlayed` int,
	`xera` double,
	`lastFetchedAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mlb_pitcher_stats_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_pitcher_team` UNIQUE(`mlbamId`,`teamAbbrev`)
);
--> statement-breakpoint
CREATE INDEX `idx_pitcher_full_name` ON `mlb_pitcher_stats` (`fullName`);