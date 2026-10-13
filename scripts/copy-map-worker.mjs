import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const source = path.join(process.cwd(), "node_modules", "maplibre-gl", "dist", "maplibre-gl-worker.mjs");
const destination = path.join(process.cwd(), "public", "maplibre-gl-worker.mjs");
mkdirSync(path.dirname(destination), { recursive: true });
copyFileSync(source, destination);
