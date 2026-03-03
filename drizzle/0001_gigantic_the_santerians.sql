CREATE TABLE `games` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileId` int NOT NULL,
	`gameDate` varchar(20) NOT NULL,
	`startTimeEst` varchar(10) NOT NULL,
	`awayTeam` varchar(128) NOT NULL,
	`awayBookSpread` decimal(6,1) NOT NULL,
	`awayModelSpread` decimal(6,1) NOT NULL,
	`homeTeam` varchar(128) NOT NULL,
	`homeBookSpread` decimal(6,1) NOT NULL,
	`homeModelSpread` decimal(6,1) NOT NULL,
	`bookTotal` decimal(6,1) NOT NULL,
	`modelTotal` decimal(6,1) NOT NULL,
	`spreadEdge` varchar(128) NOT NULL,
	`spreadDiff` decimal(5,1) NOT NULL,
	`totalEdge` varchar(128) NOT NULL,
	`totalDiff` decimal(5,1) NOT NULL,
	`sport` varchar(64) NOT NULL DEFAULT 'NCAAM',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `games_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `model_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`uploadedBy` int NOT NULL,
	`filename` varchar(255) NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`fileUrl` text NOT NULL,
	`mimeType` varchar(128) NOT NULL DEFAULT 'text/csv',
	`sizeBytes` int NOT NULL DEFAULT 0,
	`sport` varchar(64) NOT NULL DEFAULT 'NCAAM',
	`gameDate` varchar(20),
	`status` enum('pending','processing','done','error') NOT NULL DEFAULT 'pending',
	`rowsImported` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `model_files_id` PRIMARY KEY(`id`)
);
