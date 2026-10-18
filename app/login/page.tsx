import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { loginAction } from "@/lib/actions/account";
import { getCurrentUser } from "@/lib/auth/session";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user?.characterId) redirect("/dashboard");
  if (user) redirect("/create");

  return (
    <section>
      <p className="kicker text-center">Account</p>
      <h1 className="page-title mb-3 text-center">Sign in</h1>
      <p className="mx-auto mb-6 max-w-md text-center text-sm text-muted">
        Use the email and password from registration. There is no password reset on this site.
      </p>
      <AuthForm action={loginAction} submitLabel="Sign in" />
      <p className="mt-4 text-center text-sm text-muted">
        New here? <Link href="/register" className="text-gold">Join the beta</Link>
      </p>
    </section>
  );
}
