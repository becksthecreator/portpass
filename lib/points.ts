// PortPass Points (brief 25, part D): the words, pure, so the account page
// and the tests read the same ones. A ledger only: nothing to spend points
// on yet (Phase 2, after the attorney reads the scheme). No server imports.

export type PointsReason = "order_paid" | "booking_attended" | "programme_milestone" | "manual_adjust" | "expiry";

// The brief's line, word for word, wherever points are shown.
export const POINTS_RULES = "Points have no cash value, cannot be transferred, and expire 12 months after they are earned.";

export function isPointsReason(value: unknown): value is PointsReason {
  return value === "order_paid" || value === "booking_attended" || value === "programme_milestone" || value === "manual_adjust" || value === "expiry";
}

// One line of the history. Never a child's name: an attendance event is
// "Attended at <business>", whoever attended.
export function pointsEventLabel(event: { reason: PointsReason; delta: number; businessName: string | null; refType?: string | null }): string {
  const at = event.businessName ? ` at ${event.businessName}` : "";
  switch (event.reason) {
    case "order_paid":
      return `Market order paid${at}`;
    case "booking_attended":
      return `Attended a booking${at}`;
    case "programme_milestone":
      return `Programme milestone${at}`;
    case "expiry":
      return "Expired, 12 months after they were earned";
    case "manual_adjust":
      if (event.delta > 0) return "Added by PortPass";
      if (event.refType === "registration") return `Attendance mark undone${at}`;
      if (event.refType === "reservation") return `Order no longer paid${at}`;
      return "Taken off by PortPass";
  }
}

// "+10", "−35": the sign always shown, a true minus sign.
export function formatPointsDelta(delta: number): string {
  return delta < 0 ? `−${Math.abs(delta).toLocaleString("en-US")}` : `+${delta.toLocaleString("en-US")}`;
}

// How points are earned, in words, from the current rules.
export function howPointsAreEarned(rules: { perDollar: number; perAttendance: number }): string {
  const parts: string[] = [];
  if (rules.perDollar > 0) parts.push(`${rules.perDollar === 1 ? "1 point" : `${rules.perDollar} points`} for each dollar of a PortPass Market order, once the business marks it paid`);
  if (rules.perAttendance > 0) parts.push(`${rules.perAttendance} points the first time you, or a child you registered, attend something you booked`);
  return parts.length ? `You earn ${parts.join(", and ")}.` : "Earning is paused for now.";
}
