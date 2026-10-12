"use client";

import { useState, type FormEvent } from "react";
import { LOCATION_COST_MODELS } from "@/lib/coachPay";
import { COST_MODEL_LABELS, LOCATION_SURFACES, SURFACE_LABELS, WEEKDAY_SHORT, costLabel, daysLabel, isCosted, type FutprepLocation } from "@/lib/futprepLocations";

type Answer = { error?: string; locations?: FutprepLocation[] };

// What a form says about a place, as the API reads it (lib/futprepLocations.ts).
function fieldsFrom(form: HTMLFormElement) {
  const data = new FormData(form);
  const value = (name: string) => String(data.get(name) ?? "");
  return {
    name: value("name"),
    area: value("area"),
    address: value("address"),
    costModel: value("costModel"),
    cost: value("cost"),
    costNote: value("costNote"),
    surface: value("surface"),
    privateSessionsOk: data.get("privateSessionsOk") === "on",
    daysAvailable: data.getAll("day").map(Number),
    hoursNote: value("hoursNote"),
  };
}

function LocationFields({ location, idPrefix }: { location: FutprepLocation | null; idPrefix: string }) {
  return (
    <>
      <div className="team-form-two">
        <label><span>Name</span><input name="name" required minLength={3} maxLength={120} defaultValue={location?.name ?? ""} /></label>
        <label><span>Area</span><input name="area" maxLength={80} defaultValue={location?.area ?? ""} placeholder="Lyford Cay" /></label>
      </div>
      <label><span>Address</span><input name="address" maxLength={200} defaultValue={location?.address ?? ""} /></label>
      <div className="team-form-two">
        <label><span>How it&rsquo;s paid for</span>
          <select name="costModel" defaultValue={location?.costModel ?? ""}>
            <option value="">Not set yet</option>
            {LOCATION_COST_MODELS.map((model) => <option key={model} value={model}>{COST_MODEL_LABELS[model]}</option>)}
          </select>
        </label>
        <label><span>Amount ($)</span><input name="cost" inputMode="decimal" defaultValue={location && location.costCents !== null ? String(location.costCents / 100) : ""} placeholder="as Alex agreed it" /></label>
      </div>
      <label><span>Cost note</span><input name="costNote" maxLength={300} defaultValue={location?.costNote ?? ""} placeholder="Who to pay, deposit, anything else" /></label>
      <label><span>Surface</span>
        <select name="surface" defaultValue={location?.surface ?? ""}>
          <option value="">Not set</option>
          {LOCATION_SURFACES.map((surface) => <option key={surface} value={surface}>{SURFACE_LABELS[surface]}</option>)}
        </select>
      </label>
      <fieldset className="location-days">
        <legend>Days it can be used</legend>
        {WEEKDAY_SHORT.map((day, index) => (
          <label key={day} htmlFor={`${idPrefix}-day-${index + 1}`}>
            <input id={`${idPrefix}-day-${index + 1}`} type="checkbox" name="day" value={index + 1} defaultChecked={location?.daysAvailable?.includes(index + 1) ?? false} />
            <span>{day}</span>
          </label>
        ))}
      </fieldset>
      <label><span>Hours</span><input name="hoursNote" maxLength={300} defaultValue={location?.hoursNote ?? ""} placeholder="After 3 PM on school days" /></label>
      <label className="team-manager-switch">
        <input type="checkbox" name="privateSessionsOk" defaultChecked={location?.privateSessionsOk ?? false} />
        <span>Parents can choose it for a private session</span>
      </label>
    </>
  );
}

export function LocationsManager({ initialLocations }: { initialLocations: FutprepLocation[] }) {
  const [locations, setLocations] = useState(initialLocations);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function send(method: "POST" | "PATCH", payload: Record<string, unknown>, key: string): Promise<boolean> {
    setError("");
    setMessage("");
    setBusy(key);
    const response = await fetch("/api/futprep/staff/locations", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => null);
    const data: Answer = response ? await response.json().catch(() => ({})) : { error: "No connection. Try again." };
    setBusy(null);
    if (!response || !response.ok) {
      setError(data.error ?? "Could not save.");
      return false;
    }
    if (data.locations) setLocations(data.locations);
    return true;
  }

  async function save(event: FormEvent<HTMLFormElement>, location: FutprepLocation) {
    event.preventDefault();
    if (await send("PATCH", { id: location.id, ...fieldsFrom(event.currentTarget) }, `save:${location.id}`)) setMessage(`${location.name} saved.`);
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = fieldsFrom(form);
    if (await send("POST", fields, "add")) {
      form.reset();
      setMessage(`${fields.name} added.`);
    }
  }

  async function toggle(location: FutprepLocation) {
    if (await send("PATCH", { id: location.id, active: !location.active }, `switch:${location.id}`)) setMessage(`${location.name} switched ${location.active ? "off" : "on"}.`);
  }

  return (
    <div className="team-manager">
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="coach-manager-message" role="status">{message}</p>}

      <div className="team-manager-grid">
        {locations.map((location) => (
          <article className="team-manager-card" key={location.id}>
            <div>
              <span>{location.area ?? "Area not set"}</span>
              <h2>{location.name}</h2>
              <p>{costLabel(location)}{location.costNote ? ` · ${location.costNote}` : ""}</p>
              <p>{daysLabel(location.daysAvailable)}{location.hoursNote ? ` · ${location.hoursNote}` : ""}</p>
            </div>
            <div className="team-manager-flags">
              <span className={location.active ? "flag-on" : "flag-off"}>{location.active ? "In use" : "Switched off"}</span>
              {!isCosted(location) && <span className="flag-missing">No cost</span>}
              {location.surface && <span className="flag-on">{SURFACE_LABELS[location.surface]}</span>}
              {location.privateSessionsOk && <span className="flag-on">Private sessions</span>}
              <span className="flag-off">{location.programs === 1 ? "1 program" : `${location.programs} programs`}</span>
            </div>
            <details className="location-edit">
              <summary>Edit</summary>
              <form className="team-login-form" onSubmit={(event) => save(event, location)}>
                <LocationFields location={location} idPrefix={`loc-${location.id}`} />
                <button type="submit" className="primary-button" disabled={busy !== null}>{busy === `save:${location.id}` ? "Saving…" : "Save"}</button>
              </form>
            </details>
            <div className="team-manager-actions">
              <button type="button" disabled={busy !== null} onClick={() => toggle(location)}>{location.active ? "Switch off" : "Switch on"}</button>
            </div>
          </article>
        ))}
      </div>

      <div className="team-admin-panels">
        <form className="team-admin-form team-login-form" onSubmit={add}>
          <span className="section-kicker">New place</span>
          <h2>Add a location.</h2>
          <p className="team-manager-hint">Futprep enters what each place costs as agreed with the owner of the field. Leave the amount blank until it&rsquo;s confirmed; the place shows &ldquo;No cost&rdquo; until then.</p>
          <LocationFields location={null} idPrefix="loc-new" />
          <button className="primary-button" disabled={busy !== null}>{busy === "add" ? "Adding…" : "Add location →"}</button>
        </form>
      </div>
    </div>
  );
}
