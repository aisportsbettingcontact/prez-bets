CREATE TABLE `user_favorite_games` (
	`id` int AUTO_INCREMENT NOT NULL,
	`appUserId` int NOT NULL,
	`gameId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_favorite_games_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_game_uniq` UNIQUE(`appUserId`,`gameId`)
);
