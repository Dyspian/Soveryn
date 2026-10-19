"use client";

import { useActionState, useEffect, useState } from "react";
import { ActionFeedback } from "@/components/feedback/ActionFeedback";
import { organizationsAction } from "@/lib/actions/organizations";
import type { ActionResult } from "@/lib/actions/account";
import { ORG_TYPES } from "@/lib/organizations/domain";

export function OrganizationCreate({ places, invites }: { places: { id: string; name: string }[]; invites: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(organizationsAction, null);
  const [key, setKey] = useState("");
  useEffect(() => {
    setKey(crypto.randomUUID());
  }, []);
  return (
    <div className="space-y-4">
      <ActionFeedback state={state} />
      {invites.map((invite) => (
        <form key={invite.id} action={action} className="panel flex flex-wrap items-center gap-2 text-sm">
          <input type="hidden" name="intent" value="respond-invite" />
          <input type="hidden" name="invitationId" value={invite.id} />
          <span>{invite.name} invited you.</span>
          <button name="accept" value="yes" disabled={pending} className="btn btn-primary">
            Accept
          </button>
          <button name="accept" value="no" disabled={pending} className="btn btn-secondary">
            Decline
          </button>
        </form>
      ))}
      <form action={action} className="panel grid gap-3">
        <h2 className="section-title">Found an organization</h2>
        <input type="hidden" name="intent" value="create" />
        <input type="hidden" name="idempotencyKey" value={key} />
        <label className="text-sm">
          Name
          <input name="name" required minLength={3} maxLength={40} className="field" />
        </label>
        <label className="text-sm">
          Tag
          <input name="tag" required minLength={2} maxLength={5} className="field" />
        </label>
        <label className="text-sm">
          Description
          <textarea name="description" maxLength={400} className="field" rows={3} />
        </label>
        <label className="text-sm">
          Type
        <select name="orgType" className="field">
          {Object.entries(ORG_TYPES).map(([id, type]) => (
            <option key={id} value={id}>
              {type.label}
              {type.legal ? " · lawful" : ""}
            </option>
          ))}
        </select>
        </label>
        <label className="text-sm">
          Headquarters city
        <select name="placeId" className="field">
          {places.map((place) => (
            <option key={place.id} value={place.id}>
              {place.name}
            </option>
          ))}
        </select>
        </label>
        <label className="text-sm">
          Recruitment
        <select name="recruitment" className="field">
          <option value="application">Applications</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
        </label>
        <label className="text-sm">
          Visibility
        <select name="visibility" className="field">
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
        </label>
        <label className="text-sm">
          Emblem
        <select name="emblemKey" className="field">
          <option value="">No emblem</option>
          <option value="mark-1">Mark 1</option>
          <option value="mark-2">Mark 2</option>
          <option value="mark-3">Mark 3</option>
          <option value="mark-4">Mark 4</option>
          <option value="mark-5">Mark 5</option>
          <option value="mark-6">Mark 6</option>
        </select>
        </label>
        <p className="text-sm text-muted">Founding spends the configured startup cost from your character. The founder starts as leader. A lawful type cannot open a contested recovery. A rivalry does not control territory.</p>
        <button disabled={pending || !key || places.length === 0} className="btn btn-primary">
          {pending ? "Founding…" : "Found organization"}
        </button>
      </form>
    </div>
  );
}
