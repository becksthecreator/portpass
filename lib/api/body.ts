import { NextResponse } from "next/server";
import { z } from "zod";

// How a route reads its JSON body (Brief 21, part E): through a zod schema
// that names every field the route accepts and refuses any other. A body
// that is not JSON, not an object, or carries a field the route never
// reads is answered 400 before the route looks at it. What each field must
// contain is still checked by the route (the same checks as before, with
// the same messages); this is the door, not the form.
//
//   const Body = bodyOf(["email", "token", "next", "intent"]);
//   const read = await readJson(request, Body);
//   if (!read.ok) return read.response;
//   const body = read.value;
//
// lib/api/body.static.test.ts lists every route that still reads a body
// another way, so the list can only shrink.

export type Read<T> = { ok: true; value: T } | { ok: false; response: NextResponse };

export async function readJson<S extends z.ZodType>(request: Request, schema: S, message = "Invalid request."): Promise<Read<z.output<S>>> {
  const raw: unknown = await request.json().catch(() => undefined);
  if (raw === undefined) return refused(message);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return refused(message, unknownFields(parsed.error));
  return { ok: true, value: parsed.data };
}

// The fields a route reads, and no others. Values are `unknown` on purpose:
// the route's own checks decide what each one must be.
export function bodyOf<const K extends readonly string[]>(keys: K) {
  const shape = Object.fromEntries(keys.map((key) => [key, z.unknown().optional()])) as { [P in K[number]]: z.ZodOptional<z.ZodUnknown> };
  return z.strictObject(shape);
}

// Which keys the schema did not recognise, for the answer; never a value.
export function unknownFields(error: z.ZodError): string[] {
  const names = new Set<string>();
  for (const issue of error.issues) {
    if (issue.code === "unrecognized_keys") for (const key of issue.keys) names.add(String(key).slice(0, 60));
  }
  return [...names].sort();
}

function refused(message: string, fields: string[] = []): Read<never> {
  const body = fields.length ? { error: message, unknownFields: fields } : { error: message };
  return { ok: false, response: NextResponse.json(body, { status: 400 }) };
}
