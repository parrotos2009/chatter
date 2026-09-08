CREATE TABLE `chatMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` varchar(64) NOT NULL DEFAULT 'lobby',
	`clientId` varchar(64) NOT NULL,
	`displayName` varchar(120) NOT NULL,
	`text` text,
	`attachmentUrl` text,
	`attachmentName` varchar(255),
	`attachmentType` varchar(120),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chatMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chatPresence` (
	`clientId` varchar(64) NOT NULL,
	`displayName` varchar(120) NOT NULL,
	`roomId` varchar(64) NOT NULL DEFAULT 'lobby',
	`isTyping` int NOT NULL DEFAULT 0,
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chatPresence_clientId` PRIMARY KEY(`clientId`)
);
