"use client";

import { useActionState } from "react";
import { connectionAction } from "@/lib/actions/social";
import type { ActionResult } from "@/lib/actions/account";

export function ConnectionPanel({
  username,
  status,
  outgoing,
  blockedByViewer,
}: {
  username: string;
  status: string | null;
  outgoing: boolean;
  blockedByViewer: boolean;
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(connectionAction, null);
  const blocked = status === "blocked";
  return (
    <section className="mt-6 border-t border-line pt-4 text-sm">
      <h2 className="section-title">Connection</h2>
      {state?.ok ? <p className="mt-2 text-gold">{state.message}</p> : null}
      {state && !state.ok ? <p className="mt-2 text-danger">{state.error}</p> : null}
      {blocked && !blockedByViewer ? <p className="mt-2 text-muted">Contact is not available.</p> : null}
      {blocked && blockedByViewer ? <p className="mt-2 text-muted">You blocked contact from this character.</p> : null}
      {status === "pending" && outgoing ? <p className="mt-2 text-muted">Your request is waiting.</p> : null}
      {status === "pending" && !outgoing ? <p className="mt-2 text-muted">This character requested a connection.</p> : null}
      {status === "accepted" ? <p className="mt-2 text-muted">You are connected. This does not change reputation.</p> : null}
      {!status || status === "declined" || status === "removed" ? <p className="mt-2 text-muted">No connection is recorded.</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {(!status || status === "declined" || status === "removed") && !blocked ? (
          <form action={action}>
            <input type="hidden" name="intent" value="request" />
            <input type="hidden" name="username" value={username} />
            <button disabled={pending} className="btn btn-primary">Request connection</button>
          </form>
        ) : null}
        {status === "pending" && !outgoing ? (
          <>
            <form action={action}>
              <input type="hidden" name="intent" value="accept" />
              <input type="hidden" name="username" value={username} />
              <button disabled={pending} className="btn btn-primary">Accept</button>
            </form>
            <form action={action}>
              <input type="hidden" name="intent" value="decline" />
              <input type="hidden" name="username" value={username} />
              <button disabled={pending} className="btn btn-secondary">Decline</button>
            </form>
          </>
        ) : null}
        {((status === "pending" && outgoing) || status === "accepted") ? (
          <form action={action}>
            <input type="hidden" name="intent" value="remove" />
            <input type="hidden" name="username" value={username} />
            <button disabled={pending} className="btn btn-secondary">{status === "pending" ? "Cancel request" : "Remove connection"}</button>
          </form>
        ) : null}
        {blocked && blockedByViewer ? (
          <form action={action}>
            <input type="hidden" name="intent" value="unblock" />
            <input type="hidden" name="username" value={username} />
            <button disabled={pending} className="btn btn-secondary">Remove block</button>
          </form>
        ) : null}
        {!blocked ? (
          <form action={action}>
            <input type="hidden" name="intent" value="block" />
            <input type="hidden" name="username" value={username} />
            <button disabled={pending} className="btn btn-secondary">Block contact</button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
