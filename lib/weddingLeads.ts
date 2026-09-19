// Plain constants shared between server (db/weddingAdmin.ts) and client
// components (e.g. LeadDetail.tsx). Deliberately has no import of
// db/supabase.ts (which pulls in "server-only") so client components can
// import runtime values from here, not just types.
export const WEDDING_LEAD_STATUSES = [
  "new",
  "pre_consultation",
  "consultation_requested",
  "planning",
  "ready_for_antonio",
  "antonio_review",
  "quoted",
  "booked",
  "closed",
] as const;
export type WeddingLeadStatus = (typeof WEDDING_LEAD_STATUSES)[number];
