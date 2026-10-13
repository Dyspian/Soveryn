import Link from "next/link";
import { redirect } from "next/navigation";
import { CloseAccountForm } from "@/components/account/CloseAccountForm";
import { getCurrentUser } from "@/lib/auth/session";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <section className="mx-auto max-w-xl space-y-6">
      <h1 className="page-title">Account</h1>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-muted">Email</dt>
          <dd>{user.email}</dd>
        </div>
        <div>
          <dt className="text-muted">Role</dt>
          <dd>{user.role === "admin" ? "Administrator" : "Player"}</dd>
        </div>
        <div>
          <dt className="text-muted">Terms</dt>
          <dd>{user.termsAccepted ? "Accepted" : "Not accepted yet"}</dd>
        </div>
      </dl>
      <p className="text-sm">
        <Link href="/legal" className="text-gold">
          Read the terms and privacy notice
        </Link>
      </p>
      <CloseAccountForm />
    </section>
  );
}
