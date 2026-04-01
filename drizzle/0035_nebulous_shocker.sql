CREATE TABLE `discord_oauth_states` (
	`state` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`expiresAt` bigint NOT NULL,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `discord_oauth_states_state` PRIMARY KEY(`state`)
);
