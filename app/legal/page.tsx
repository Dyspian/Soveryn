import Link from "next/link";

export default function LegalPage() {
  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <p className="kicker">Account</p>
      <h1 className="page-title">Terms and privacy</h1>
      <p className="text-sm text-muted">
        This notice describes how this game stores data. It is not a certification of legal compliance.
      </p>
      <h2 className="font-serif text-2xl">What is stored</h2>
      <p>
        An account stores an email address and a scrypt password hash. A session is a random token kept as a hash in an
        http-only cookie. A character stores a username, optional display name and biography, a built-in portrait, and a
        starting city chosen from imported geography.
      </p>
      <p>
        Gameplay records include currency ledger entries, inventory, businesses, missions, political votes, organization
        membership, and background-job results. Those records are the authority for balances and outcomes.
      </p>
      <h2 className="font-serif text-2xl">What is not collected</h2>
      <p>The game does not ask for a real name, address, payment card, or precise device location. The map uses public geographic data, not your position.</p>
      <h2 className="font-serif text-2xl">Closing an account</h2>
      <p>
        Closing an account from <Link href="/account" className="text-gold">Account</Link> replaces the email, removes
        the password, and ends every session. The character, ledger, votes, and organization history stay so other
        players&apos; records remain consistent. This is not a silent deletion of financial history.
      </p>
      <h2 className="font-serif text-2xl">Map data</h2>
      <p>
        Place names and coordinates come from GeoNames (CC BY 4.0). Country boundaries come from Natural Earth (public
        domain). Map tiles are OpenFreeMap, using OpenStreetMap data. Oil and gas figures, when present, are imported
        country totals and are not invented city deposits.
      </p>
      <p className="text-sm text-muted">Fictional politics, businesses, and organizations are game state. They are not real governments or real news. Warfare is not part of this version.</p>
    </section>
  );
}
