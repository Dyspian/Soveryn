"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
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
  const [visible, setVisible] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const errorId = useId();
  const hintId = useId();
  const failed = Boolean(state && !state.ok);

  useEffect(() => {
    if (failed) errorRef.current?.focus();
  }, [failed, state]);

  return (
    <form action={formAction} className="panel mx-auto max-w-md space-y-4">
      <label className="block text-sm">
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="field"
          aria-invalid={failed || undefined}
          aria-describedby={failed ? errorId : undefined}
        />
      </label>
      <div className="block text-sm">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="password">Password</label>
          <button
            type="button"
            className="nav-link min-h-11 px-1"
            aria-pressed={visible}
            onClick={() => setVisible((current) => !current)}
          >
            {visible ? "Hide" : "Show"}
          </button>
        </div>
        <input
          id="password"
          name="password"
          type={visible ? "text" : "password"}
          autoComplete={requireTerms ? "new-password" : "current-password"}
          required
          minLength={8}
          className="field"
          aria-invalid={failed || undefined}
          aria-describedby={requireTerms ? (failed ? `${hintId} ${errorId}` : hintId) : failed ? errorId : undefined}
        />
        {requireTerms ? (
          <p id={hintId} className="mt-2 text-sm text-muted">
            At least 8 characters.
          </p>
        ) : null}
      </div>
      {requireTerms ? (
        <label className="flex items-start gap-2 text-sm">
          <input name="terms" type="checkbox" value="yes" required className="mt-1" />
          <span>
            I agree to the <Link href="/legal" className="text-gold">terms and privacy notice</Link>.
          </span>
        </label>
      ) : null}
      {state && !state.ok ? (
        <p id={errorId} ref={errorRef} tabIndex={-1} className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      <button disabled={pending} className="btn btn-primary min-h-11 w-full">
        {pending ? "Working…" : submitLabel}
      </button>
    </form>
  );
}
