ALTER TABLE `mlb_strikeout_props` ADD `anNoVigOverPct` varchar(16);--> statement-breakpoint
ALTER TABLE `mlb_strikeout_props` ADD `anPlayerId` int;--> statement-breakpoint
ALTER TABLE `mlb_strikeout_props` ADD `actualKs` int;--> statement-breakpoint
ALTER TABLE `mlb_strikeout_props` ADD `backtestResult` varchar(16);--> statement-breakpoint
ALTER TABLE `mlb_strikeout_props` ADD `modelError` varchar(16);--> statement-breakpoint
ALTER TABLE `mlb_strikeout_props` ADD `modelCorrect` tinyint;--> statement-breakpoint
ALTER TABLE `mlb_strikeout_props` ADD `backtestRunAt` bigint;