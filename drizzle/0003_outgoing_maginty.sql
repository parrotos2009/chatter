CREATE TABLE `chatRooms` (
	`id` varchar(64) NOT NULL,
	`name` varchar(80) NOT NULL,
	`createdBy` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chatRooms_id` PRIMARY KEY(`id`)
);
