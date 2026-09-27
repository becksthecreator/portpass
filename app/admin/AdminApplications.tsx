"use client";

import Link from "next/link";
import { useState } from "react";
import type { ApplicationRecord } from "@/db/applications";
import { formatPhoneDisplay } from "@/lib/phone";
import { sectionName } from "@/lib/sections";

export function AdminApplications({ initialApplications }: { initialApplications: ApplicationRecord[] }) {
  const [applications, setApplications] = useState(initialApplications);
  const [busy, setBusy] = useState<number | null>(null);

  async function review(id: number, decision: "approved" | "rejected") {
    setBusy(id);
    try {
      const response = await fetch(`/api/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!response.ok) throw new Error();
      setApplications((current) =>
        current.map((item) =>
          item.id === id
            ? { ...item, status: decision, reviewed_at: new Date().toISOString() }
            : item
        )
      );
      window.location.reload();
    } finally {
      setBusy(null);
    }
  }

  const submitted = applications.filter((a) => a.status === "submitted").length;
  const approved = applications.filter((a) => a.status === "approved").length;
  const rejected = applications.filter((a) => a.status === "rejected").length;

  return (
    <>
      <div className="admin-summary">
        <div><strong>{submitted}</strong><span>Pending</span></div>
        <div><strong>{approved}</strong><span>Approved</span></div>
        <div><strong>{rejected}</strong><span>Rejected</span></div>
      </div>
      <section className="application-list">
        {applications.length === 0 && <div className="dashboard-empty"><h3>No applications yet.</h3></div>}
        {applications.map((application) => {
          const whatsapp = application.whatsapp_e164 ?? null;
          const contact = whatsapp ? formatPhoneDisplay(whatsapp) : application.email ?? application.phone ?? "";
          const source = [application.utm_source, application.utm_medium, application.utm_campaign].filter(Boolean).join(" / ");
          return (
            <article className="application-card" key={application.id}>
              <div className="application-card-head">
                <div>
                  <span className={`status status-${application.status}`}>{application.status}</span>
                  <h2>{application.organization_name}</h2>
                  <p>{application.contact_person}{contact ? ` · ${contact}` : ""}</p>
                </div>
                <span className="submitted-date">{new Date(application.submitted_at).toLocaleDateString("en-BS")}</span>
              </div>
              <dl className="application-details">
                <div><dt>Section</dt><dd>{sectionName(application.section) ?? application.activity_type ?? "—"}</dd></div>
                {whatsapp && (
                  <div><dt>WhatsApp</dt><dd><a href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">{formatPhoneDisplay(whatsapp)} ↗</a></dd></div>
                )}
                {application.instagram_handle && (
                  <div><dt>Instagram</dt><dd><a href={`https://instagram.com/${encodeURIComponent(application.instagram_handle)}`} target="_blank" rel="noopener noreferrer">@{application.instagram_handle} ↗</a></dd></div>
                )}
                {application.email && <div><dt>Email</dt><dd>{application.email}</dd></div>}
                {!whatsapp && application.phone && <div><dt>Phone</dt><dd>{application.phone}</dd></div>}
                {application.main_location && <div><dt>Location</dt><dd>{application.main_location}</dd></div>}
                {application.player_count && <div><dt>Players</dt><dd>{application.player_count}</dd></div>}
                {application.help_needed && <div><dt>Needs help with</dt><dd>{application.help_needed}</dd></div>}
                {source && <div><dt>Source</dt><dd>{source}</dd></div>}
              </dl>
              {application.description && <p className="application-description">{application.description}</p>}
              <div className="application-actions">
                {application.status === "submitted" ? (
                  <>
                    <button disabled={busy === application.id} onClick={() => review(application.id,"approved")}>Approve</button>
                    <button className="reject-button" disabled={busy === application.id} onClick={() => review(application.id,"rejected")}>Reject</button>
                  </>
                ) : application.status === "approved" && application.organization_id ? (
                  <Link className="primary-button" href={`/organizations/${application.organization_id}`}>Open organization dashboard →</Link>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>
    </>
  );
}
