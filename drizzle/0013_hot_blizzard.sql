CREATE TABLE `nba_teams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dbSlug` varchar(128) NOT NULL,
	`nbaSlug` varchar(64) NOT NULL,
	`vsinSlug` varchar(128) NOT NULL,
	`name` varchar(255) NOT NULL,
	`nickname` varchar(128) NOT NULL,
	`city` varchar(128) NOT NULL,
	`conference` varchar(16) NOT NULL,
	`division` varchar(64) NOT NULL,
	`logoUrl` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `nba_teams_id` PRIMARY KEY(`id`),
	CONSTRAINT `nba_teams_dbSlug_unique` UNIQUE(`dbSlug`),
	CONSTRAINT `nba_teams_nbaSlug_unique` UNIQUE(`nbaSlug`),
	CONSTRAINT `nba_teams_vsinSlug_unique` UNIQUE(`vsinSlug`)
);
