"use client";

import { useActionState } from "react";
import { Portrait } from "@/components/brand/Portrait";
import { updateProfileAction, type ActionResult } from "@/lib/actions/account";
import { PORTRAIT_KEYS } from "@/lib/validation";

export function ProfileForm({
  displayName,
  biography,
  portraitKey,
}: {
  displayName: string;
  biography: string;
  portraitKey: string;
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(updateProfileAction, null);
  return (
    <form action={action} className="panel space-y-4">
      <div>
        <h2 className="section-title">Profile</h2>
        <p className="mt-1 text-sm text-muted">Display name, biography, and portrait are the fields you can change.</p>
      </div>
      <label className="block text-sm">
        Display name
        <input name="displayName" defaultValue={displayName} maxLength={40} className="field" />
      </label>
      <label className="block text-sm">
        Biography
        <textarea name="biography" defaultValue={biography} maxLength={2000} rows={5} className="field" />
      </label>
      <fieldset>
        <legend className="text-sm">Portrait</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {PORTRAIT_KEYS.map((key) => (
            <label key={key} className="border border-line p-1 has-[:checked]:border-gold">
              <input className="sr-only" type="radio" name="portraitKey" value={key} defaultChecked={key === portraitKey} />
              <Portrait portraitKey={key} className="h-12 w-12" />
              <span className="sr-only">{key}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {state?.ok ? <p className="text-sm text-gold" role="status">Profile saved.</p> : null}
      {state && !state.ok ? (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      <button disabled={pending} className="btn btn-primary">
        {pending ? "Saving…" : "Save profile"}
      </button>
      <p className="text-sm text-muted">The political home country stays the one chosen at creation. A journey changes the recorded city only after it arrives.</p>
    </form>
  );
}
