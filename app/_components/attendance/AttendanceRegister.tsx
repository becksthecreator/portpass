"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Status = "present" | "late" | "absent" | "excused";
type Row = { registrationId: number; participantName: string; status: Status | null };

const CHOICES: { value: Status; label: string }[] = [
  { value: "present", label: "Here" },
  { value: "late", label: "Late" },
  { value: "absent", label: "Away" },
  { value: "excused", label: "Excused" },
];

// One session's register: a name and four buttons. Each press is saved on
// its own, so a dropped signal loses one mark, not the register.
export function AttendanceRegister({ endpoint, sessionId, rows }: { endpoint: string; sessionId: number; rows: Row[] }) {
  const router = useRouter();
  const [marks, setMarks] = useState<Record<number, Status | null>>(() => Object.fromEntries(rows.map((r) => [r.registrationId, r.status])));
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function mark(registrationId: number, status: Status) {
    const before = marks[registrationId] ?? null;
    setBusy(registrationId);
    setError("");
    setMarks((current) => ({ ...current, [registrationId]: status }));
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, registrationId, status }) }).catch(() => null);
    setBusy(null);
    if (!response || !response.ok) {
      const data = response ? ((await response.json().catch(() => ({}))) as { error?: string }) : {};
      setMarks((current) => ({ ...current, [registrationId]: before }));
      return setError(data.error ?? "That mark wasn't saved. Check your signal and press it again.");
    }
    router.refresh();
  }

  const done = rows.filter((r) => marks[r.registrationId]).length;
  return (
    <>
      <p className="att-progress" role="status">{done} of {rows.length} marked</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <ul className="att-register">
        {rows.map((r) => (
          <li key={r.registrationId}>
            <strong>{r.participantName}</strong>
            <div className="att-choices" role="group" aria-label={`Attendance for ${r.participantName}`}>
              {CHOICES.map((choice) => (
                <button key={choice.value} type="button" className={`att-choice is-${choice.value}`} aria-pressed={marks[r.registrationId] === choice.value} disabled={busy === r.registrationId} onClick={() => void mark(r.registrationId, choice.value)}>
                  {choice.label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
