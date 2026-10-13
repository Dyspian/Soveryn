"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { ActionResult } from "@/lib/actions/account";

export function AuthForm({
  action,
  submitLabel,
  requireTerms = false,
}: {
  action: (state: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  requireTerms?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="panel mx-auto max-w-md space-y-4">
      <label className="block text-sm">
        Email
        <input name="email" type="email" autoComplete="email" required className="field" />
      </label>
      <label className="block text-sm">
        Password
        <input name="password" type="password" autoComplete="current-password" required minLength={8} className="field" />
      </label>
      {requireTerms ? (
        <label className="flex items-start gap-2 text-sm">
          <input name="terms" type="checkbox" value="yes" required className="mt-1" />
          <span>
            I agree to the <Link href="/legal" className="text-gold">terms and privacy notice</Link>.
          </span>
        </label>
      ) : null}
      {state && !state.ok ? (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      <button disabled={pending} className="btn btn-primary w-full">
        {pending ? "Working…" : submitLabel}
      </button>
    </form>
  );
}
