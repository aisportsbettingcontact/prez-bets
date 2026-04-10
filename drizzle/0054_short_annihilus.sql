CREATE TABLE `security_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventType` varchar(32) NOT NULL,
	`ip` varchar(64) NOT NULL,
	`blockedOrigin` varchar(512),
	`trpcPath` varchar(256),
	`httpMethod` varchar(16),
	`userAgent` varchar(512),
	`context` text,
	`occurredAt` bigint NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `security_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_sec_event_type` ON `security_events` (`eventType`);--> statement-breakpoint
CREATE INDEX `idx_sec_event_ip` ON `security_events` (`ip`);--> statement-breakpoint
CREATE INDEX `idx_sec_event_occurred_at` ON `security_events` (`occurredAt`);