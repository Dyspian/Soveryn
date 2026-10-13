import { openDatabase, withTransaction } from "@/lib/db";
import { applyMigrations } from "@/lib/db/migrate";
import { advanceWorld } from "@/lib/world/tick";

let ready: Promise<void> | null = null;
const scheduler = globalThis as { soverynTick?: ReturnType<typeof setInterval> };

export function ensureDatabase(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const database = await openDatabase();
      await applyMigrations(database.sql);
      startWorldTick();
    })().catch((error: unknown) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

function startWorldTick() {
  if (scheduler.soverynTick) return;
  const run = () => {
    void withTransaction((sql) => advanceWorld(sql))
      .then((result) => {
        if (!result.skipped) {
          console.info(
            JSON.stringify({
              event: "world_tick",
              processed: result.processed,
              failed: result.failed,
              activated: result.activated,
              resolved: result.resolved,
              opened: result.opened,
              at: new Date().toISOString(),
            }),
          );
        }
      })
      .catch((error: unknown) => {
        console.error(JSON.stringify({ event: "world_tick_failed", message: error instanceof Error ? error.message : "unknown" }));
      });
  };
  run();
  scheduler.soverynTick = setInterval(run, 30_000);
  scheduler.soverynTick.unref?.();
}
