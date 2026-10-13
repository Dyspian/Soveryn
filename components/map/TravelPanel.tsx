"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { travelAction, type TravelActionResult } from "@/lib/actions/travel";
import type { CityRecord } from "@/lib/geo/queries";
import type { TravelState } from "@/lib/travel/service";
import { formatUtc } from "@/lib/world/clock";

export function TravelPanel({ city, travel }: { city: CityRecord | null; travel: TravelState }) {
  const [state, action, pending] = useActionState<TravelActionResult | null, FormData>(travelAction, null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const quotedFor = state?.ok ? state.quote?.destinationId : null;

  useEffect(() => {
    setConfirmKey(null);
  }, [city?.id]);

  useEffect(() => {
    if (state?.ok && state.quote && state.quote.destinationId === city?.id) setConfirmKey(crypto.randomUUID());
  }, [city?.id, state]);

  if (travel.active) {
    return (
      <div className="mt-3 border-t border-line pt-3">
        <h3 className="kicker">In transit</h3>
        <p className="mt-2">
          Toward {travel.active.destinationName}, {travel.active.destinationCountry}.
        </p>
        <p className="text-muted">
          Left {formatUtc(travel.active.departedAt)}. Due {formatUtc(travel.active.arrivesAt)}. Cost {travel.active.cost}. Straight-line estimate {travel.active.distanceKm.toLocaleString("en-US")} km.
        </p>
        <p className="mt-2 text-xs text-muted">You are still recorded in {travel.cityName} until that time. Refreshing does not move you early.</p>
      </div>
    );
  }

  if (!city) return null;
  if (city.id === travel.placeId) {
    return <p className="mt-3 text-sm text-gold">This is your recorded city.</p>;
  }
  if (city.startingStatus !== "open") {
    return <p className="mt-3 text-sm text-muted">This place is not an open starting city, so a journey cannot end here.</p>;
  }

  const quoteReady = quotedFor === city.id && state?.ok && state.quote;

  return (
    <div className="mt-3 border-t border-line pt-3">
      <h3 className="kicker">Journey</h3>
      <p className="mt-2 text-xs text-muted">From {travel.cityName}. Selecting this city does not move you.</p>
      {state?.ok ? <p className="mt-2 text-sm" role="status">{state.message}</p> : null}
      {state && !state.ok ? <p className="mt-2 text-sm text-danger" role="alert">{state.error}</p> : null}
      {quoteReady && confirmKey ? (
        <form action={action} className="mt-2 space-y-2">
          <input type="hidden" name="intent" value="depart" />
          <input type="hidden" name="placeId" value={city.id} />
          <input type="hidden" name="idempotencyKey" value={confirmKey} />
          <button disabled={pending} className="btn btn-primary">
            {pending ? "Departing…" : "Confirm departure"}
          </button>
        </form>
      ) : (
        <form action={action} className="mt-2">
          <input type="hidden" name="intent" value="quote" />
          <input type="hidden" name="placeId" value={city.id} />
          <button
            disabled={pending}
            className="btn btn-secondary"
          >
            {pending ? "Calculating…" : "Review journey"}
          </button>
        </form>
      )}
    </div>
  );
}
