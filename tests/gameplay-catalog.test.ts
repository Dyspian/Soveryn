import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { siteMissions, siteSkills, siteSpecializations } from "@/components/site/gameplay-catalog";

const progression = readFileSync(path.join(process.cwd(), "db", "migrations", "0003_progression.sql"), "utf8");

describe("public gameplay catalog", () => {
  it("names only specializations, skills, and missions stored in the progression migration", () => {
    for (const specialization of siteSpecializations) expect(progression).toContain(`'${specialization}'`);
    for (const skill of siteSkills) expect(progression).toContain(`'${skill}'`);
    for (const mission of siteMissions) expect(progression).toContain(`'${mission}'`);
  });
});
