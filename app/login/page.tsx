import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";
import { loginAction } from "@/lib/actions/account";

export default function LoginPage() {
  return (
    <section>
      <p className="kicker text-center">Account</p>
      <h1 className="page-title mb-6 text-center">Sign in</h1>
      <AuthForm action={loginAction} submitLabel="Sign in" />
      <p className="mt-4 text-center text-sm text-muted">
        New here? <Link href="/register" className="text-gold">Create an account</Link>
      </p>
    </section>
  );
}
