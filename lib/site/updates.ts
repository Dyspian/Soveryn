import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const CATEGORIES = new Set(["Patch notes", "Update", "Maintenance", "Devlog"]);

export type DeveloperUpdate = {
  id: string;
  title: string;
  category: string;
  summary: string;
  publishedAt: string;
};

function field(block: string, name: string): string | null {
  const match = block.match(new RegExp(`^${name}:\\s*(.+)$`, "m"));
  const value = match?.[1]?.trim() ?? "";
  if (!value || value.length > 240) return null;
  return value;
}

export function readDeveloperUpdate(id: string, source: string): DeveloperUpdate | null {
  if (!/^[a-z0-9-]{1,80}$/.test(id)) return null;
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match?.[1]) return null;
  const block = match[1];
  if (field(block, "status") !== "published") return null;
  const title = field(block, "title");
  const category = field(block, "category");
  const summary = field(block, "summary");
  const published = field(block, "published");
  if (!title || !category || !CATEGORIES.has(category) || !summary || !published) return null;
  if (/[<>]/.test(`${title} ${category} ${summary}`)) return null;
  const publishedAt = new Date(published);
  if (Number.isNaN(publishedAt.getTime())) return null;
  return { id, title, category, summary, publishedAt: publishedAt.toISOString() };
}

export function loadDeveloperUpdates(directory: string): DeveloperUpdate[] {
  const names = readdirSync(directory).filter((name) => name.endsWith(".md"));
  const updates: DeveloperUpdate[] = [];
  for (const name of names) {
    const id = name.slice(0, -3);
    const source = readFileSync(path.join(directory, name), "utf8");
    const update = readDeveloperUpdate(id, source);
    if (update) updates.push(update);
  }
  updates.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt) || left.id.localeCompare(right.id));
  return updates.slice(0, 6);
}
