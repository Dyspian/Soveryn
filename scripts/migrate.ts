import { applyMigrations } from "../lib/db/migrate";
import { closeDatabase, openDatabase } from "../lib/db";

const database = await openDatabase();
const applied = await applyMigrations(database.sql);
console.log(applied.length > 0 ? `Applied ${applied.join(", ")}` : "Migrations already applied.");
await closeDatabase();
