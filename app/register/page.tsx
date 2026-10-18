import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { registerAction } from "@/lib/actions/account";
import { getCurrentUser } from "@/lib/auth/session";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user?.characterId) redirect("/dashboard");
  if (user) redirect("/create");

  return (
    <section>
      <p className="kicker text-center">Account</p>
      <h1 className="page-title mb-3 text-center">Create your account</h1>
      <p className="mx-auto mb-6 max-w-md text-center text-sm text-muted">
        The next step is one character and an open starting city. The game is in beta. Player progression will be wiped
        after beta. There is no password reset on this site.
      </p>
      <AuthForm action={registerAction} submitLabel="Join the beta" requireTerms />
      <p className="mt-4 text-center text-sm text-muted">
        Already registered? <Link href="/login" className="text-gold">Sign in</Link>
      </p>
    </section>
  );
}
