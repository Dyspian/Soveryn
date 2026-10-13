import { z } from "zod";
import { SPECIALIZATIONS } from "@/lib/progression/rules";

export const PORTRAIT_KEYS = ["mark-1", "mark-2", "mark-3", "mark-4", "mark-5", "mark-6"] as const;

export const loginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(72),
});

export const registerSchema = loginSchema.extend({
  terms: z.literal("yes", { error: "Accept the terms and privacy notice to create an account." }),
});

export const closeAccountSchema = z.object({
  password: z.string().min(8).max(72),
  confirmation: z.literal("CLOSE", { error: "Type CLOSE to confirm." }),
});

export const characterSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_]{3,20}$/, "Use 3–20 letters, numbers, or underscores."),
  displayName: z.string().trim().max(40).optional().or(z.literal("")),
  biography: z.string().trim().max(2000).optional().or(z.literal("")),
  portraitKey: z.enum(PORTRAIT_KEYS),
  countryIso2: z.string().trim().length(2),
  placeId: z.string().uuid(),
  specialization: z.enum(SPECIALIZATIONS),
  confirmed: z.literal("yes", { error: "Confirm the character before creating it." }),
});

export const profileSchema = z.object({
  displayName: z.string().trim().max(40).optional().or(z.literal("")),
  biography: z.string().trim().max(2000).optional().or(z.literal("")),
  portraitKey: z.enum(PORTRAIT_KEYS),
});

export const startingStatusSchema = z.object({
  placeId: z.string().uuid(),
  status: z.enum(["open", "disabled", "full", "restricted", "event"]),
  capacity: z.string().trim().optional().or(z.literal("")),
});

export function parseCapacity(value: string | undefined): number | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) {
    throw new Error("Capacity must be a positive whole number, or empty for no limit.");
  }
  const capacity = Number(trimmed);
  if (capacity < 1) {
    throw new Error("Capacity must be a positive whole number, or empty for no limit.");
  }
  return capacity;
}
