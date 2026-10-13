import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";
import { registerAction } from "@/lib/actions/account";

export default function RegisterPage() {
  return (
    <section>
      <p className="kicker text-center">Account</p>
      <h1 className="page-title mb-6 text-center">Create your account</h1>
      <AuthForm action={registerAction} submitLabel="Register" requireTerms />
      <p className="mt-4 text-center text-sm text-muted">
        Already registered? <Link href="/login" className="text-gold">Sign in</Link>
      </p>
    </section>
  );
}
