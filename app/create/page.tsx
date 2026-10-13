import { redirect } from "next/navigation";
import { CreateCharacterForm } from "@/components/character/CreateCharacterForm";
import { getCurrentUser } from "@/lib/auth/session";
import { getSql } from "@/lib/db";
import { hasGeography, listCountries } from "@/lib/geo/queries";

export default async function CreatePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.characterId) redirect("/dashboard");
  const sql = await getSql();
  if (!(await hasGeography(sql))) {
    return (
      <section className="max-w-2xl">
        <h1 className="page-title">Geography is not imported</h1>
        <p className="mt-3 text-muted">
          Run <code>npm run db:import</code> to download GeoNames and Natural Earth and load the 30 launch countries.
          Character creation stays closed until that import succeeds.
        </p>
      </section>
    );
  }
  const countries = await listCountries(sql);
  return (
    <section>
      <p className="kicker">Character</p>
      <h1 className="page-title mb-2">Create your character</h1>
      <p className="mb-6 max-w-3xl text-muted">
        Identity, starting location, and specialization are saved together. Populations and coordinates come from the
        imported sources. A blank population was not reported; a source value of 0 is kept as unverified rather than
        shown as a real count.
      </p>
      <CreateCharacterForm countries={countries} />
    </section>
  );
}
