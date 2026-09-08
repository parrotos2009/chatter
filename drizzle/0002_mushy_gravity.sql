CREATE TABLE `callSignals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` varchar(64) NOT NULL DEFAULT 'lobby',
	`fromClientId` varchar(64) NOT NULL,
	`toClientId` varchar(64) NOT NULL,
	`kind` varchar(32) NOT NULL,
	`payload` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `callSignals_id` PRIMARY KEY(`id`)
);
