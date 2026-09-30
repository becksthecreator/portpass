"use client";

import { FormEvent, useMemo, useState } from "react";
import type { FutprepProgramSummary, FutprepSite } from "@/db/programs";
import { formatMoney } from "../../config";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function dollarsToCents(value: FormDataEntryValue | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export function AddProgramManager({ initialPrograms, sites = [] }: { initialPrograms: FutprepProgramSummary[]; sites?: FutprepSite[] }) {
  const [programs, setPrograms] = useState(initialPrograms);
  // Brief 13: the form changes for a school contract, and a chosen site
  // replaces typing a location.
  const [programType, setProgramType] = useState<"term" | "camp" | "contract">("term");
  const [siteId, setSiteId] = useState("");
  const isContract = programType === "contract";
  // Programs grouped by site (brief 13).
  const bySite = useMemo(() => {
    const groups = new Map<string, FutprepProgramSummary[]>();
    for (const program of programs) {
      const key = program.siteName ?? "No site yet";
      groups.set(key, [...(groups.get(key) ?? []), program]);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => (a === "No site yet" ? 1 : b === "No site yet" ? -1 : a.localeCompare(b)));
  }, [programs]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [toggleError, setToggleError] = useState("");
  const [busy, setBusy] = useState(false);

  async function toggleActive(program: FutprepProgramSummary) {
    setToggleError("");
    const response = await fetch("/api/futprep/programs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: program.id, active: !program.active }),
    });
    const data = (await response.json()) as { error?: string; programs?: FutprepProgramSummary[] };
    if (!response.ok) return setToggleError(data.error ?? "Could not update the program.");
    if (data.programs) setPrograms(data.programs);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    setBusy(true);
    setError("");
    setMessage("");

    const form = new FormData(formEl);
    const breakDates = String(form.get("breakDates") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const payload = {
      name: form.get("name"),
      ageMin: Number(form.get("ageMin")),
      ageMax: Number(form.get("ageMax")),
      coed: form.get("coed") === "on",
      locationName: form.get("locationName"),
      locationAddress: form.get("locationAddress"),
      dayOfWeek: form.get("dayOfWeek"),
      startTime: form.get("startTime"),
      endTime: form.get("endTime"),
      capacity: Number(form.get("capacity")),
      termName: form.get("termName") || "Term 1",
      termStartDate: form.get("termStartDate"),
      termEndDate: form.get("termEndDate"),
      breakDates,
      weeklyFeeCents: dollarsToCents(form.get("weeklyFee")),
      termFeeCents: dollarsToCents(form.get("termFee")),
      registrationFeeCents: dollarsToCents(form.get("registrationFee")),
      programType,
      locationId: siteId ? Number(siteId) : null,
      contractClient: isContract ? form.get("contractClient") : null,
      contractFeeCents: isContract ? dollarsToCents(form.get("contractFee")) : null,
      contractBilling: isContract ? form.get("contractBilling") : null,
      registrationClosesAt: form.get("registrationClosesAt") || "",
      whatToBring: form.get("whatToBring") || "",
    };

    try {
      const response = await fetch("/api/futprep/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { error?: string; programs?: FutprepProgramSummary[] };
      if (!response.ok) throw new Error(data.error ?? "Could not create the program.");
      if (data.programs) setPrograms(data.programs);
      setMessage(isContract ? "School contract created -- its sessions are on the coaches' roster, and it's on the Contracts page." : "Program created — it's live on the registration page now.");
      formEl.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the program.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="team-manager">
      {toggleError && <p className="form-error" role="alert">{toggleError}</p>}
      {bySite.map(([site, sitePrograms]) => (
      <section className="program-site-group" key={site} aria-label={site}>
      <h2 className="program-site-heading">{site}</h2>
      <div className="team-manager-grid">
        {sitePrograms.map((program) => (
          <article className="team-manager-card" key={program.id}>
            <div>
              <span>{program.programType === "contract" ? `School contract · ${program.contractClient ?? ""}` : program.programType === "camp" ? `Camp · ages ${program.ageLabel}` : `Ages ${program.ageLabel}`}</span>
              <h2>{program.name}</h2>
              <p>{program.dayOfWeek} · {program.startTime}{program.endTime ? `–${program.endTime}` : ""} · {program.location}</p>
            </div>
            <div className="team-manager-flags">
              <span className={program.active ? "flag-on" : "flag-off"}>{program.active ? "Active" : "Inactive"}</span>
              {program.programType === "contract" && program.contractFeeCents !== null && (
                <span className="flag-on">{formatMoney(program.contractFeeCents)} {program.contractBilling === "per_term" ? "per term" : "per session"}</span>
              )}
              {program.programType !== "contract" && program.spotsRemaining !== null && (
                <span className="flag-on">{program.spotsRemaining} of {program.capacity} spots open</span>
              )}
            </div>
            <div className="team-manager-actions">
              <button
                className={program.active ? "danger-action" : ""}
                onClick={() => {
                  if (program.active && !confirm(`Hide ${program.name} from the registration page? Existing registrations are kept, and you can reactivate it any time.`)) return;
                  toggleActive(program);
                }}
              >
                {program.active ? "Deactivate" : "Reactivate"}
              </button>
            </div>
            <details className="team-profile-details">
              <summary>Term details</summary>
              <dl>
                <div><dt>Term</dt><dd>{program.term ? `${program.term.name} · ${program.term.startDate} – ${program.term.endDate}` : "No active term"}</dd></div>
                <div><dt>Weekly fee</dt><dd>{program.term ? formatMoney(program.term.weeklyFeeCents) : "—"}</dd></div>
                <div><dt>Term fee</dt><dd>{program.term ? formatMoney(program.term.termFeeCents) : "—"}</dd></div>
                <div><dt>Registered</dt><dd>{program.registered}</dd></div>
              </dl>
            </details>
          </article>
        ))}
      </div>
      </section>
      ))}
      {programs.length === 0 && <p className="coach-manager-message">No programs yet — add the first one below.</p>}

      <div className="team-admin-panels">
        <form className="team-admin-form" onSubmit={submit}>
          <span className="section-kicker">New program</span>
          <h2>Add a class or location.</h2>

          <div className="team-form-two">
            <label><span>Program name *</span><input name="name" placeholder="Futprep Out East Lil Kickers" required /></label>
            <label><span>Capacity *</span><input name="capacity" type="number" min={1} defaultValue={20} required /></label>
          </div>

          <div className="team-form-two">
            <label><span>Type *</span>
              <select name="programType" value={programType} onChange={(e) => setProgramType(e.target.value === "camp" ? "camp" : e.target.value === "contract" ? "contract" : "term")}>
                <option value="term">Weekly class (a term)</option>
                <option value="camp">Holiday camp (every weekday between the dates)</option>
                <option value="contract">School contract (the school pays Futprep)</option>
              </select>
            </label>
            <label><span>Registration closes <small>(optional, Nassau time)</small></span><input name="registrationClosesAt" type="datetime-local" /></label>
          </div>
          <p className="form-hint">For a camp: the day of week is ignored, the start and end times are the daily hours, set the weekly fee to 0 and put the camp fee in &ldquo;Full term fee&rdquo;. Camp days are created automatically, skipping weekends and break dates.</p>
          {isContract && (
            <>
              <p className="form-hint">A school contract is never public or registrable. Staff keep its roster by name (the school holds parent and medical details) and mark attendance; the Contracts page works out what to invoice.</p>
              <label><span>School (who pays) *</span><input name="contractClient" placeholder="St Andrew's School" required /></label>
              <div className="team-form-two">
                <label><span>Contract fee (BSD) *</span><input name="contractFee" type="number" min={0} step="0.01" required /></label>
                <label><span>Billed *</span>
                  <select name="contractBilling" defaultValue="per_session">
                    <option value="per_session">Per session delivered</option>
                    <option value="per_term">Per term</option>
                  </select>
                </label>
              </div>
            </>
          )}
          <label><span>What to bring <small>(optional, shown on the camps page)</small></span><textarea name="whatToBring" rows={2} placeholder="Boots or trainers, shin pads, water bottle, sunscreen, a snack" /></label>

          <div className="team-form-two">
            <label><span>Age min *</span><input name="ageMin" type="number" min={0} required /></label>
            <label><span>Age max *</span><input name="ageMax" type="number" min={0} required /></label>
          </div>

          <label className="inline-choice"><input name="coed" type="checkbox" defaultChecked /> Co-ed</label>

          <label><span>Site</span>
            <select name="locationId" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">A new location (type it below)</option>
              {sites.map((site) => <option key={site.id} value={site.id}>{site.name}{site.area && site.area !== site.name ? ` · ${site.area}` : ""}</option>)}
            </select>
          </label>
          {!siteId && (
            <div className="team-form-two">
              <label><span>Location name *</span><input name="locationName" placeholder="Futprep Out East Field" required /></label>
              <label><span>Location address</span><input name="locationAddress" placeholder="Street, settlement, island" /></label>
            </div>
          )}

          <div className="team-form-two">
            <label><span>Day of week *</span>
              <select name="dayOfWeek" defaultValue="Saturday" required>
                {DAYS.map((day) => <option key={day} value={day}>{day}</option>)}
              </select>
            </label>
            <label><span>Capacity note</span><small>Spots open shows automatically once parents register.</small></label>
          </div>

          <div className="team-form-two">
            <label><span>Start time *</span><input name="startTime" placeholder="9:00 AM" required /></label>
            <label><span>End time</span><input name="endTime" placeholder="9:35 AM" /></label>
          </div>

          <div className="team-form-two">
            <label><span>Term name</span><input name="termName" placeholder="Term 1" defaultValue="Term 1" /></label>
            <label><span>Break dates</span><input name="breakDates" placeholder="2026-10-10, 2026-10-17" /></label>
          </div>

          <div className="team-form-two">
            <label><span>Term start date *</span><input name="termStartDate" type="date" required /></label>
            <label><span>Term end date *</span><input name="termEndDate" type="date" required /></label>
          </div>

          <div className="team-form-two">
            <label><span>Weekly fee (BSD){isContract ? "" : " *"}</span><input name="weeklyFee" type="number" min={0} step="0.01" required={!isContract} defaultValue={isContract ? 0 : undefined} /></label>
            <label><span>Full term fee (BSD){isContract ? "" : " *"}</span><input name="termFee" type="number" min={0} step="0.01" required={!isContract} defaultValue={isContract ? 0 : undefined} /></label>
          </div>

          <label><span>Registration fee (BSD)</span><input name="registrationFee" type="number" min={0} step="0.01" defaultValue={0} /></label>

          {error && <p className="form-error" role="alert">{error}</p>}
          {message && <p className="coach-manager-message">{message}</p>}

          <button className="primary-button" disabled={busy}>{busy ? "Creating…" : "Create program →"}</button>
        </form>
      </div>
    </div>
  );
}
