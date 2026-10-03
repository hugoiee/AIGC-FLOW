ALTER TABLE `generations` ADD `project_id` integer REFERENCES projects(id);--> statement-breakpoint
CREATE INDEX `generations_project_id_idx` ON `generations` (`project_id`);