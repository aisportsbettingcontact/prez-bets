CREATE TABLE `mlb_game_backtest` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gameId` int NOT NULL,
	`gameDate` varchar(10) NOT NULL,
	`market` varchar(16) NOT NULL,
	`modelSide` varchar(8),
	`modelProb` decimal(5,2),
	`bookLine` varchar(16),
	`bookOdds` varchar(16),
	`bookNoVigProb` decimal(5,4),
	`edge` decimal(5,4),
	`ev` decimal(6,2),
	`confidencePassed` tinyint,
	`result` varchar(16),
	`correct` tinyint,
	`actualAwayScore` int,
	`actualHomeScore` int,
	`awayPitcher` varchar(128),
	`homePitcher` varchar(128),
	`backtestRunAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mlb_game_backtest_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_backtest_game_market` UNIQUE(`gameId`,`market`)
);
--> statement-breakpoint
CREATE TABLE `mlb_hr_props` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gameId` int NOT NULL,
	`side` varchar(8) NOT NULL,
	`playerName` varchar(128) NOT NULL,
	`mlbamId` int,
	`anPlayerId` int,
	`teamAbbrev` varchar(8),
	`bookLine` decimal(4,1) DEFAULT '0.5',
	`fdOverOdds` varchar(16),
	`fdUnderOdds` varchar(16),
	`consensusOverOdds` varchar(16),
	`consensusUnderOdds` varchar(16),
	`anNoVigOverPct` varchar(16),
	`modelPHr` varchar(16),
	`modelOverOdds` varchar(16),
	`edgeOver` varchar(16),
	`evOver` varchar(16),
	`verdict` varchar(16),
	`actualHr` tinyint,
	`backtestResult` varchar(16),
	`modelCorrect` tinyint,
	`modelRunAt` bigint,
	`backtestRunAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mlb_hr_props_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_hr_game_player` UNIQUE(`gameId`,`playerName`)
);
--> statement-breakpoint
CREATE TABLE `mlb_model_learning_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`market` varchar(16) NOT NULL,
	`windowDays` int NOT NULL,
	`accuracyBefore` decimal(5,4),
	`accuracyAfter` decimal(5,4),
	`maeBefore` decimal(6,4),
	`maeAfter` decimal(6,4),
	`paramChanges` text,
	`triggerReason` varchar(32),
	`sampleSize` int,
	`runAt` bigint NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mlb_model_learning_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `games` ADD `actualAwayScore` int;--> statement-breakpoint
ALTER TABLE `games` ADD `actualHomeScore` int;--> statement-breakpoint
ALTER TABLE `games` ADD `fgMlResult` varchar(16);--> statement-breakpoint
ALTER TABLE `games` ADD `fgRlResult` varchar(16);--> statement-breakpoint
ALTER TABLE `games` ADD `fgTotalResult` varchar(16);--> statement-breakpoint
ALTER TABLE `games` ADD `fgMlCorrect` tinyint;--> statement-breakpoint
ALTER TABLE `games` ADD `fgRlCorrect` tinyint;--> statement-breakpoint
ALTER TABLE `games` ADD `fgTotalCorrect` tinyint;--> statement-breakpoint
ALTER TABLE `games` ADD `fgBacktestRunAt` bigint;--> statement-breakpoint
ALTER TABLE `games` ADD `f5AwayRunLine` varchar(8);--> statement-breakpoint
ALTER TABLE `games` ADD `f5HomeRunLine` varchar(8);--> statement-breakpoint
ALTER TABLE `games` ADD `f5AwayRunLineOdds` varchar(16);--> statement-breakpoint
ALTER TABLE `games` ADD `f5HomeRunLineOdds` varchar(16);--> statement-breakpoint
ALTER TABLE `games` ADD `f5Total` varchar(8);--> statement-breakpoint
ALTER TABLE `games` ADD `f5OverOdds` varchar(16);--> statement-breakpoint
ALTER TABLE `games` ADD `f5UnderOdds` varchar(16);--> statement-breakpoint
ALTER TABLE `games` ADD `f5AwayML` varchar(16);--> statement-breakpoint
ALTER TABLE `games` ADD `f5HomeML` varchar(16);--> statement-breakpoint
ALTER TABLE `games` ADD `modelF5AwayScore` decimal(5,2);--> statement-breakpoint
ALTER TABLE `games` ADD `modelF5HomeScore` decimal(5,2);--> statement-breakpoint
ALTER TABLE `games` ADD `modelF5Total` decimal(5,1);--> statement-breakpoint
ALTER TABLE `games` ADD `modelF5OverRate` decimal(5,2);--> statement-breakpoint
ALTER TABLE `games` ADD `modelF5UnderRate` decimal(5,2);--> statement-breakpoint
ALTER TABLE `games` ADD `modelF5AwayWinPct` decimal(5,2);--> statement-breakpoint
ALTER TABLE `games` ADD `modelF5HomeWinPct` decimal(5,2);--> statement-breakpoint
ALTER TABLE `games` ADD `modelF5AwayML` varchar(16);--> statement-breakpoint
ALTER TABLE `games` ADD `modelF5HomeML` varchar(16);--> statement-breakpoint
ALTER TABLE `games` ADD `modelF5AwayRLCoverPct` decimal(5,2);--> statement-breakpoint
ALTER TABLE `games` ADD `modelF5HomeRLCoverPct` decimal(5,2);--> statement-breakpoint
ALTER TABLE `games` ADD `modelF5OverOdds` varchar(16);--> statement-breakpoint
ALTER TABLE `games` ADD `modelF5UnderOdds` varchar(16);--> statement-breakpoint
ALTER TABLE `games` ADD `actualF5AwayScore` int;--> statement-breakpoint
ALTER TABLE `games` ADD `actualF5HomeScore` int;--> statement-breakpoint
ALTER TABLE `games` ADD `f5MlResult` varchar(16);--> statement-breakpoint
ALTER TABLE `games` ADD `f5RlResult` varchar(16);--> statement-breakpoint
ALTER TABLE `games` ADD `f5TotalResult` varchar(16);--> statement-breakpoint
ALTER TABLE `games` ADD `f5MlCorrect` tinyint;--> statement-breakpoint
ALTER TABLE `games` ADD `f5RlCorrect` tinyint;--> statement-breakpoint
ALTER TABLE `games` ADD `f5TotalCorrect` tinyint;--> statement-breakpoint
ALTER TABLE `games` ADD `f5BacktestRunAt` bigint;--> statement-breakpoint
ALTER TABLE `games` ADD `nrfiOverOdds` varchar(16);--> statement-breakpoint
ALTER TABLE `games` ADD `yrfiUnderOdds` varchar(16);--> statement-breakpoint
ALTER TABLE `games` ADD `modelPNrfi` decimal(5,2);--> statement-breakpoint
ALTER TABLE `games` ADD `modelNrfiOdds` varchar(16);--> statement-breakpoint
ALTER TABLE `games` ADD `modelYrfiOdds` varchar(16);--> statement-breakpoint
ALTER TABLE `games` ADD `nrfiActualResult` varchar(16);--> statement-breakpoint
ALTER TABLE `games` ADD `nrfiBacktestResult` varchar(16);--> statement-breakpoint
ALTER TABLE `games` ADD `nrfiCorrect` tinyint;--> statement-breakpoint
ALTER TABLE `games` ADD `nrfiBacktestRunAt` bigint;--> statement-breakpoint
ALTER TABLE `games` ADD `modelAwayHrPct` decimal(5,2);--> statement-breakpoint
ALTER TABLE `games` ADD `modelHomeHrPct` decimal(5,2);--> statement-breakpoint
ALTER TABLE `games` ADD `modelBothHrPct` decimal(5,2);--> statement-breakpoint
ALTER TABLE `games` ADD `modelAwayExpHr` decimal(4,2);--> statement-breakpoint
ALTER TABLE `games` ADD `modelHomeExpHr` decimal(4,2);--> statement-breakpoint
CREATE INDEX `idx_backtest_date` ON `mlb_game_backtest` (`gameDate`);--> statement-breakpoint
CREATE INDEX `idx_backtest_market` ON `mlb_game_backtest` (`market`);--> statement-breakpoint
CREATE INDEX `idx_backtest_result` ON `mlb_game_backtest` (`result`);--> statement-breakpoint
CREATE INDEX `idx_hr_game` ON `mlb_hr_props` (`gameId`);--> statement-breakpoint
CREATE INDEX `idx_hr_mlbam` ON `mlb_hr_props` (`mlbamId`);--> statement-breakpoint
CREATE INDEX `idx_learning_market` ON `mlb_model_learning_log` (`market`);--> statement-breakpoint
CREATE INDEX `idx_learning_run_at` ON `mlb_model_learning_log` (`runAt`);