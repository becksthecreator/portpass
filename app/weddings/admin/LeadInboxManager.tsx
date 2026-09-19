"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { WeddingLeadListItem, WeddingLeadStatus } from "@/db/weddingAdmin";

const STATUS_LABEL: Record<WeddingLeadStatus, string> = {
  new: "New",
  pre_consultation: "Pre-consultation",
  consultation_requested: "Consultation requested",
  planning: "Planning",
  ready_for_antonio: "Ready for Antonio",
  antonio_review: "Antonio review",
  quoted: "Quoted",
  booked: "Booked",
  closed: "Closed",
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function LeadInboxManager({ initialLeads }: { initialLeads: WeddingLeadListItem[] }) {
  const [filter, setFilter] = useState<"all" | "unanswered" | WeddingLeadStatus>("all");
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return initialLeads.filter((lead) => {
      if (filter === "unanswered" && !lead.unanswered) return false;
      if (filter !== "all" && filter !== "unanswered" && lead.status !== filter) return false;
      if (!query) return true;
      return lead.names.toLowerCase().includes(query) || (lead.email ?? "").toLowerCase().includes(query);
    });
  }, [initialLeads, filter, search]);

  const unansweredCount = initialLeads.filter((l) => l.unanswered).length;

  return (
    <>
      <div className="staff-summary staff-summary-four">
        <article><span>Total enquiries</span><strong>{initialLeads.length}</strong></article>
        <article><span>Needs attention</span><strong>{unansweredCount}</strong></article>
        <article><span>In planning</span><strong>{initialLeads.filter((l) => l.status === "planning" || l.status === "pre_consultation").length}</strong></article>
        <article><span>Booked</span><strong>{initialLeads.filter((l) => l.status === "booked").length}</strong></article>
      </div>

      <input
        className="staff-search-input"
        type="search"
        placeholder="Search by name or email…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="staff-filter">
        <button className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>All</button>
        <button className={filter === "unanswered" ? "is-active" : ""} onClick={() => setFilter("unanswered")}>Needs attention</button>
        {(Object.keys(STATUS_LABEL) as WeddingLeadStatus[]).map((status) => (
          <button key={status} className={filter === status ? "is-active" : ""} onClick={() => setFilter(status)}>{STATUS_LABEL[status]}</button>
        ))}
      </div>

      <div className="staff-registration-list">
        {visible.length === 0 && <div className="dashboard-empty"><h3>No enquiries here.</h3></div>}
        {visible.map((lead) => (
          <Link className="staff-registration-card wedding-lead-card" key={lead.id} href={`/weddings/admin/${lead.id}`}>
            <div className="staff-registration-head">
              <div>
                <span className="panel-kicker">{lead.ceremonyType || "Still exploring"}{lead.packageName ? ` · ${lead.packageName}` : ""}</span>
                <h2>{lead.names}</h2>
                <p>{lead.preferredWeddingDate || "Date still deciding"} · {lead.guestCount ?? "?"} guests · {lead.travelOrigin || "Origin unknown"}</p>
              </div>
              <div className="staff-status-stack">
                <span className="status status-submitted">{STATUS_LABEL[lead.status]}</span>
                {lead.unanswered && <span className="status status-rejected">Needs attention</span>}
              </div>
            </div>
            {lead.unanswered && (
              <div className="pending-details-flag">
                <strong>No update since {formatWhen(lead.updatedAt)}</strong> — this enquiry has been sitting for over 24 hours.
              </div>
            )}
            <div className="staff-info-grid">
              <div><span>Email</span><strong>{lead.email || "Not given"}</strong></div>
              <div><span>Phone</span><strong>{lead.phone || "Not given"}</strong></div>
              <div><span>Received</span><strong>{formatWhen(lead.createdAt)}</strong></div>
              <div><span>Last activity</span><strong>{formatWhen(lead.updatedAt)}</strong></div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
