CREATE TABLE `mlb_pitcher_rolling5` (
	`id` int AUTO_INCREMENT NOT NULL,
	`mlbamId` int NOT NULL,
	`fullName` varchar(128) NOT NULL,
	`teamAbbrev` varchar(8) NOT NULL,
	`startsIncluded` int NOT NULL,
	`ip5` double,
	`er5` int,
	`h5` int,
	`bb5` int,
	`k5` int,
	`hr5` int,
	`era5` double,
	`k9_5` double,
	`bb9_5` double,
	`hr9_5` double,
	`whip5` double,
	`fip5` double,
	`lastStartDate` varchar(10),
	`firstStartDate` varchar(10),
	`lastFetchedAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mlb_pitcher_rolling5_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_pitcher_rolling5` UNIQUE(`mlbamId`)
);
--> statement-breakpoint
CREATE TABLE `mlb_team_batting_splits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamAbbrev` varchar(8) NOT NULL,
	`mlbTeamId` int NOT NULL,
	`hand` varchar(1) NOT NULL,
	`avg` double,
	`obp` double,
	`slg` double,
	`ops` double,
	`homeRuns` int,
	`atBats` int,
	`baseOnBalls` int,
	`strikeOuts` int,
	`hits` int,
	`gamesPlayed` int,
	`hr9` double,
	`bb9` double,
	`k9` double,
	`woba` double,
	`lastFetchedAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mlb_team_batting_splits_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_team_batting_hand` UNIQUE(`teamAbbrev`,`hand`)
);
--> statement-breakpoint
ALTER TABLE `mlb_pitcher_stats` ADD `fip` double;--> statement-breakpoint
ALTER TABLE `mlb_pitcher_stats` ADD `xfip` double;--> statement-breakpoint
ALTER TABLE `mlb_pitcher_stats` ADD `fipMinus` double;--> statement-breakpoint
ALTER TABLE `mlb_pitcher_stats` ADD `eraMinus` double;--> statement-breakpoint
ALTER TABLE `mlb_pitcher_stats` ADD `war` double;--> statement-breakpoint
ALTER TABLE `mlb_pitcher_stats` ADD `throwsHand` varchar(1);--> statement-breakpoint
CREATE INDEX `idx_rolling5_name` ON `mlb_pitcher_rolling5` (`fullName`);--> statement-breakpoint
CREATE INDEX `idx_batting_splits_team` ON `mlb_team_batting_splits` (`teamAbbrev`);