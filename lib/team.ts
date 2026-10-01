// The initials shown on navy when a team member has no photo yet (the
// coaches page and the Futprep home grid, brief 16 C2/C3): "Coach Andre
// Roberts" → "AR", "Keione Rayside (Kiki)" → "KR".
export function initialsOf(displayName: string): string {
  const parts = displayName
    .replace(/^Coach\s+/i, "")
    .replace(/\(.*?\)/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
  return initials || "F";
}
