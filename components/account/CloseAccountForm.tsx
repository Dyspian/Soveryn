"use client";

import { useActionState } from "react";
import { closeAccountAction, type ActionResult } from "@/lib/actions/account";

export function CloseAccountForm() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(closeAccountAction, null);
  return (
    <form action={formAction} className="panel space-y-3">
      <h2 className="section-title">Close account</h2>
      <p className="text-sm text-muted">
        This signs you out and retires the login. Character, currency, and political history stay in the game records.
      </p>
      <label className="block text-sm">
        Password
        <input name="password" type="password" autoComplete="current-password" required minLength={8} className="field" />
      </label>
      <label className="block text-sm">
        Type CLOSE
        <input name="confirmation" type="text" required className="field" />
      </label>
      {state && !state.ok ? (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      <button disabled={pending} className="btn btn-danger">
        {pending ? "Working…" : "Close account"}
      </button>
    </form>
  );
}
