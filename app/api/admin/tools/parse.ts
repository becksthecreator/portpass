// Field rules for Admin -> Our tools, shared by create and update.
export type AdminLinkFields = { title?: string; url?: string | null; description?: string | null; sort?: number };

export function parseAdminLink(body: Record<string, unknown> | null, options: { requireTitle: boolean }): { value: AdminLinkFields } | { error: string } {
  if (!body) return { error: "Invalid request." };
  const value: AdminLinkFields = {};
  if (body.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 80) : "";
    if (title.length < 2) return { error: "Give the tool a name." };
    value.title = title;
  } else if (options.requireTitle) {
    return { error: "Give the tool a name." };
  }
  if (body.url !== undefined) {
    if (body.url === null || body.url === "") value.url = null;
    else {
      const url = typeof body.url === "string" ? body.url.trim().slice(0, 500) : "";
      if (!/^https:\/\/[^\s]+$/i.test(url)) return { error: "The link must start with https://." };
      value.url = url;
    }
  }
  if (body.description !== undefined) {
    if (body.description === null) value.description = null;
    else if (typeof body.description === "string") value.description = body.description.trim().slice(0, 200) || null;
    else return { error: "The description is text." };
  }
  if (body.sort !== undefined) {
    if (typeof body.sort !== "number" || !Number.isInteger(body.sort) || body.sort < -1000 || body.sort > 1000) return { error: "Order is a whole number." };
    value.sort = body.sort;
  }
  return { value };
}
