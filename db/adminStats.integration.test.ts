import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { ADMIN_COUNT_COLUMNS, getAdminOverview } from "./adminStats";

// Quick fixes, 29 Sept: the Admin Overview went 500 because one tile
// counted on a column that did not exist. Every table/column pair a tile
// filters on is checked here against the local schema, so the same
// mistake fails in CI, not in production.
describe("admin overview columns", () => {
  it("every counted column exists", async () => {
    const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
    const missing: string[] = [];
    for (const { table, column } of ADMIN_COUNT_COLUMNS) {
      const { error } = await db.from(table).select(column, { head: true, count: "exact" }).limit(1);
      if (error) missing.push(`${table}.${column}: ${error.message}`);
    }
    expect(missing).toEqual([]);
  });

  it("renders every tile as a number against the seeded schema", async () => {
    const overview = await getAdminOverview();
    const values = [
      ...Object.values(overview.needsAction),
      ...Object.values(overview.thisWeek),
      overview.platform.totalListings,
      overview.platform.liveListings,
      overview.platform.accounts,
    ];
    expect(values.every((v) => typeof v === "number")).toBe(true);
  });
});
