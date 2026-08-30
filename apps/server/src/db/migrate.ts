import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, dbPath } from "./index";

migrate(db, { migrationsFolder: "./drizzle" });
console.log(`✅ 迁移已应用: ${dbPath}`);
