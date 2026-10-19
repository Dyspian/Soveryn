import type { ActionResult } from "@/lib/actions/account";

export function ActionFeedback({ state, className = "" }: { state: ActionResult | null; className?: string }) {
  if (!state) return null;
  if (state.ok) {
    if (!state.message) return null;
    return (
      <p className={`text-sm text-gold ${className}`} role="status">
        {state.message}
      </p>
    );
  }
  return (
    <p className={`text-sm text-danger ${className}`} role="alert">
      {state.error}
    </p>
  );
}
