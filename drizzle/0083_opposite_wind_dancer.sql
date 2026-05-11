ALTER TABLE `games` ADD `modelProjTotal` decimal(6,2);--> statement-breakpoint
ALTER TABLE `games` ADD `modelWeatherAdj` decimal(5,4);--> statement-breakpoint
ALTER TABLE `mlb_park_factors` ADD `hrFactor` double;